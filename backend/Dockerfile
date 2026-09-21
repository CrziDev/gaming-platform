# Build from the repository root: docker build -f backend/Dockerfile .
FROM golang:1.26 AS build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server \
 && CGO_ENABLED=0 go build -o /out/seed ./cmd/seed \
 && GOBIN=/out CGO_ENABLED=0 go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.19.1

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/server /out/seed /out/migrate /
COPY database/migrations /migrations
EXPOSE 8080
ENTRYPOINT ["/server"]
