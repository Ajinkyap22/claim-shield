FROM golang:1.24-alpine AS builder

WORKDIR /app

COPY apps/extract-file/go.mod apps/extract-file/go.sum ./
RUN go mod download

COPY apps/extract-file/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /extract-file .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates

COPY --from=builder /extract-file /usr/local/bin/extract-file

EXPOSE 8080

CMD ["extract-file"]
