package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "solve":
		err = solve(os.Args[2:])
	case "simulate":
		err = simulate(os.Args[2:])
	case "verify":
		err = verify(os.Args[2:])
	default:
		usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "gameverify:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `usage:
  gameverify solve    -config <ref> [-target <bp>]                          derive slot weights for every board
  gameverify simulate -config <ref> [-target <bp>] [-rounds N] [-tolerance <bp>]   play every board through the production path
  gameverify verify   -profile <id> [-rounds N] [-tolerance <bp>]            simulate a draft profile's configuration and mark it verified (DATABASE_URL)`)
}
