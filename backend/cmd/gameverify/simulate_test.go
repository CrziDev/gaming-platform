package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/engine/plinko"
)

func TestRunSimulationCoversEveryBoardAndAgreesWithTheory(t *testing.T) {
	profile, err := plinko.ProfileByRef("plinko/v1/9600")
	if err != nil {
		t.Fatal(err)
	}
	result, err := runSimulation(profile, 9600, 20_000, 100, 10_000)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Boards) != 27 || result.SampleSize != 27*20_000 || result.TheoreticalBasisPoints != 9600 {
		t.Fatalf("report = %+v", result)
	}
	for _, board := range result.Boards {
		if board.TheoreticalBasisPoints != 9600 || board.StakeMinor != 20_000*100 || board.NoiseBasisPoints <= 0 {
			t.Fatalf("board %+v", board)
		}
		if board.ObservedBasisPoints < 5000 || board.ObservedBasisPoints > 20000 {
			t.Fatalf("%d rows %s observed %d bp is not a plausible return", board.Params.Rows, board.Params.Risk, board.ObservedBasisPoints)
		}
	}
	if len(result.failures()) != 0 {
		t.Fatalf("failures under a 10000 bp tolerance: %+v", result.failures())
	}
}

func TestReportFailsBoardsOffTargetOrOutsideTolerance(t *testing.T) {
	profile, err := plinko.ProfileByRef("plinko/v1/9600")
	if err != nil {
		t.Fatal(err)
	}
	offTarget, err := runSimulation(profile, 9700, 1_000, 100, 10_000)
	if err != nil {
		t.Fatal(err)
	}
	if len(offTarget.failures()) != 27 {
		t.Fatalf("a 9700 target must fail every 9600 board, failed %d", len(offTarget.failures()))
	}
	tight, err := runSimulation(profile, 9600, 1_000, 100, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(tight.failures()) == 0 {
		t.Fatal("a zero tolerance over 1000 rounds must fail some board")
	}
	var out bytes.Buffer
	writeReport(&out, tight)
	if !strings.Contains(out.String(), "| NO |") || strings.Count(out.String(), "\n| ") != 28 {
		t.Fatalf("report:\n%s", out.String())
	}
}

func TestRunSimulationRefusesBadArguments(t *testing.T) {
	profile, err := plinko.ProfileByRef("plinko/v1/9600")
	if err != nil {
		t.Fatal(err)
	}
	for name, args := range map[string][3]int64{"no rounds": {0, 100, 100}, "no stake": {10, 0, 100}, "negative tolerance": {10, 100, -1}} {
		if _, err := runSimulation(profile, 9600, args[0], args[1], int(args[2])); err == nil {
			t.Fatalf("%s: expected an error", name)
		}
	}
}

func TestBasisPointsRoundsHalfUp(t *testing.T) {
	for _, c := range []struct {
		wins, stakes int64
		want         int
	}{{96, 100, 9600}, {1, 3, 3333}, {2, 3, 6667}, {0, 100, 0}} {
		if got := basisPoints(c.wins, c.stakes); got != c.want {
			t.Fatalf("%d/%d: want %d, got %d", c.wins, c.stakes, c.want, got)
		}
	}
}
