FROM golang:1.24-alpine AS builder

WORKDIR /app

COPY apps/extract-file/go.mod apps/extract-file/go.sum ./
RUN go mod download

COPY apps/extract-file/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /extract-file .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates netcat-openbsd

COPY --from=builder /extract-file /usr/local/bin/extract-file

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
    CMD nc -z localhost 8080 || exit 1

CMD ["extract-file"]
