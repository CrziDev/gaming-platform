package engine

import "errors"

var (
	ErrInvalidParams  = errors.New("engine: parameters are invalid")
	ErrUnknownConfig  = errors.New("engine: configuration reference is unknown")
	ErrInvalidConfig  = errors.New("engine: configuration is invalid")
	ErrInvalidWeights = errors.New("engine: weights must be positive and sum within int64")
)
