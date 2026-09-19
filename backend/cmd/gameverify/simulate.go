package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"math/big"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gaming-platform/backend/internal/engine"
	"github.com/gaming-platform/backend/internal/engine/plinko"
)

const (
	defaultRounds    = 100_000_000
	defaultStake     = 100
	defaultTolerance = 100
)

type boardResult struct {
	Params                 plinko.Params
	Rounds                 int64
	TheoreticalBasisPoints int
	ObservedBasisPoints    int
	// Three standard errors of the observed return, in basis points: the width a
	// sample this size cannot resolve below, reported so a tolerance can be judged.
	NoiseBasisPoints float64
	StakeMinor       int64
	WinMinor         int64
}

type report struct {
	Ref                    string
	Target                 int
	RoundsPerBoard         int64
	StakeMinor             int64
	ToleranceBasisPoints   int
	Boards                 []boardResult
	TheoreticalBasisPoints int
	ObservedBasisPoints    int
	SampleSize             int64
	Elapsed                time.Duration
}

// passes is the one verdict: the board's theory is exactly the target and its
// observed return is within tolerance of it.
func (b boardResult) passes(target, tolerance int) bool {
	return b.TheoreticalBasisPoints == target && absInt(b.ObservedBasisPoints-target) <= tolerance
}

func (r report) failures() []boardResult {
	var out []boardResult
	for _, board := range r.Boards {
		if !board.passes(r.Target, r.ToleranceBasisPoints) {
			out = append(out, board)
		}
	}
	return out
}

func simulate(args []string) error {
	flags := flag.NewFlagSet("simulate", flag.ContinueOnError)
	ref := flags.String("config", "", "engine configuration reference to simulate; every option by default")
	target := flags.Int("target", 0, "return the configuration is meant to produce, in basis points; its own by default")
	rounds := flags.Int64("rounds", defaultRounds, "rounds to play on every board")
	stake := flags.Int64("stake", defaultStake, "stake per round in minor units")
	tolerance := flags.Int("tolerance", defaultTolerance, "largest accepted distance from the target, in basis points")
	if err := flags.Parse(args); err != nil {
		return err
	}
	var profiles []plinko.Profile
	if *ref == "" {
		for _, option := range plinko.Options() {
			profile, err := plinko.ProfileByRef(option.Ref)
			if err != nil {
				return err
			}
			profiles = append(profiles, profile)
		}
	} else {
		profile, err := plinko.ProfileByRef(*ref)
		if err != nil {
			return err
		}
		profiles = append(profiles, profile)
	}
	var failed []string
	for i, profile := range profiles {
		want := *target
		if want == 0 {
			want = profile.BasisPoints
		}
		result, err := runSimulation(profile, want, *rounds, *stake, *tolerance)
		if err != nil {
			return err
		}
		if i > 0 {
			fmt.Fprintln(os.Stdout)
		}
		writeReport(os.Stdout, result)
		if failures := result.failures(); len(failures) > 0 {
			failed = append(failed, fmt.Sprintf("%s: %d of %d boards are outside %d bp of %d bp", profile.Ref, len(failures), len(result.Boards), *tolerance, want))
		}
	}
	if len(failed) > 0 {
		return fmt.Errorf("simulate: %s", strings.Join(failed, "; "))
	}
	return nil
}

// runSimulation plays every board through the production Pick and Payout path
// with the secure source, boards in parallel, and reports each board and the whole.
func runSimulation(profile plinko.Profile, target int, rounds, stakeMinor int64, tolerance int) (report, error) {
	if rounds <= 0 || stakeMinor <= 0 || tolerance < 0 {
		return report{}, errors.New("simulate: rounds and stake must be positive and tolerance non-negative")
	}
	started := time.Now()
	var boards []plinko.Params
	for rows := plinko.MinRows; rows <= plinko.MaxRows; rows++ {
		for _, risk := range plinko.Risks {
			boards = append(boards, plinko.Params{Rows: rows, Risk: risk})
		}
	}

	results := make([]boardResult, len(boards))
	errs := make([]error, len(boards))
	var wg sync.WaitGroup
	limit := make(chan struct{}, runtime.GOMAXPROCS(0))
	for i, params := range boards {
		wg.Add(1)
		limit <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-limit }()
			results[i], errs[i] = simulateBoard(profile, params, rounds, stakeMinor)
		}()
	}
	wg.Wait()
	if err := errors.Join(errs...); err != nil {
		return report{}, err
	}

	out := report{Ref: profile.Ref, Target: target, RoundsPerBoard: rounds, StakeMinor: stakeMinor, ToleranceBasisPoints: tolerance, Boards: results}
	var stakes, wins int64
	for _, board := range results {
		if board.TheoreticalBasisPoints != out.TheoreticalBasisPoints && out.TheoreticalBasisPoints != 0 {
			return report{}, fmt.Errorf("simulate: %s boards disagree on their theoretical return", profile.Ref)
		}
		out.TheoreticalBasisPoints = board.TheoreticalBasisPoints
		stakes += board.StakeMinor
		wins += board.WinMinor
		out.SampleSize += board.Rounds
	}
	out.ObservedBasisPoints = basisPoints(wins, stakes)
	out.Elapsed = time.Since(started)
	return out, nil
}

func simulateBoard(profile plinko.Profile, params plinko.Params, rounds, stakeMinor int64) (boardResult, error) {
	table, err := profile.Table(params)
	if err != nil {
		return boardResult{}, err
	}
	theoretical, err := plinko.TheoreticalBasisPoints(table)
	if err != nil {
		return boardResult{}, err
	}
	src := engine.SecureSource()
	result := boardResult{Params: params, Rounds: rounds, TheoreticalBasisPoints: theoretical}
	var sumMultiplier, sumMultiplierSquared float64
	for range rounds {
		slot, err := plinko.Pick(src, table)
		if err != nil {
			return boardResult{}, err
		}
		multiplier := table.MultipliersHundredths[slot]
		win, err := plinko.Payout(stakeMinor, multiplier)
		if err != nil {
			return boardResult{}, err
		}
		result.StakeMinor += stakeMinor
		result.WinMinor += win
		sumMultiplier += float64(multiplier)
		sumMultiplierSquared += float64(multiplier) * float64(multiplier)
	}
	result.ObservedBasisPoints = basisPoints(result.WinMinor, result.StakeMinor)
	n := float64(rounds)
	mean := sumMultiplier / n
	variance := sumMultiplierSquared/n - mean*mean
	// A multiplier in hundredths is a return in percent; basis points are ×100.
	result.NoiseBasisPoints = 3 * math.Sqrt(variance/n) * 100
	return result, nil
}

// basisPoints is wins / stakes in basis points, rounded half up. The sums of a
// long run can be large enough that wins × 10 000 leaves int64, so the ratio is
// taken in big integers; the result itself is at most a few multiples of 10 000.
func basisPoints(wins, stakes int64) int {
	numerator := new(big.Int).Mul(big.NewInt(wins), big.NewInt(10_000))
	numerator.Add(numerator, big.NewInt(stakes/2))
	return int(numerator.Div(numerator, big.NewInt(stakes)).Int64())
}

func writeReport(w io.Writer, r report) {
	fmt.Fprintf(w, "%s — %d rounds per board at %d minor units, %d boards, %s\n\n", r.Ref, r.RoundsPerBoard, r.StakeMinor, len(r.Boards), r.Elapsed.Round(time.Millisecond))
	fmt.Fprintln(w, "| Rows | Risk | Theoretical | Observed | Δ target | ±3σ | Within tolerance |")
	fmt.Fprintln(w, "|---:|---|---:|---:|---:|---:|---|")
	for _, board := range r.Boards {
		verdict := "yes"
		if !board.passes(r.Target, r.ToleranceBasisPoints) {
			verdict = "NO"
		}
		fmt.Fprintf(w, "| %d | %s | %d | %d | %+d | %.0f | %s |\n", board.Params.Rows, board.Params.Risk, board.TheoreticalBasisPoints, board.ObservedBasisPoints, board.ObservedBasisPoints-r.Target, board.NoiseBasisPoints, verdict)
	}
	fmt.Fprintf(w, "\nAll boards: theoretical %d bp, observed %d bp over %d rounds, tolerance ±%d bp of %d bp target.\n", r.TheoreticalBasisPoints, r.ObservedBasisPoints, r.SampleSize, r.ToleranceBasisPoints, r.Target)
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
