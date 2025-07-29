#!/usr/bin/env bash

JSON_FILE="$1"

truncate_field() {
    local value="$1"
    local maxlen="$2"
    printf "%.${maxlen}s" "$value"
}

print_header_error_rate() {
    printf "\n%s\n" "ERROR RATE METRICS"
    printf "%-36s | %-10s | %-6s | %-6s\n" "Metric" "Percent" "Passes" "Fails"
    printf "%s\n" "$(printf '=%.0s' {1..66})"
}

print_header_latency() {
    printf "\n%s\n" "LATENCY METRICS"
    printf "%-36s | %-12s | %-12s | %-12s | %-12s | %-12s | %-12s\n" \
        "Metric" "avg (ms)" "min (ms)" "med (ms)" "max (ms)" "p(90)" "p(95)"
    printf "%s\n" "$(printf '=%.0s' {1..122})"
}

print_header_http() {
    printf "\n%s\n" "HTTP METRICS"
    printf "%-36s | %-12s | %-12s | %-12s | %-12s | %-12s | %-12s\n" \
        "Metric" "avg (ms)" "min (ms)" "med (ms)" "max (ms)" "p(90)" "p(95)"
    printf "%s\n" "$(printf '=%.0s' {1..122})"
}

print_header_gas() {
    printf "\n%s\n" "GAS METRICS"
    printf "%-36s | %-12s | %-12s | %-12s\n" "Metric" "value (MIST)" "min" "max"
    printf "%s\n" "$(printf '=%.0s' {1..88})"
}

extract_error_rate_metrics() {
    jq -r '
        .metrics | to_entries[] |
        select(.key | test("^errorRate_")) |
        {
            key: .key,
            value: (.value.value // 0),
            passes: (.value.passes // 0),
            fails: (.value.fails // 0)
        } | [.key, (.value * 100 | tostring + "%"), .passes, .fails] | @tsv
    ' "$JSON_FILE"
}

extract_latency_metrics() {
    jq -r '
        .metrics | to_entries[] |
        select(.key | test("_latency$")) |
        {
            key: .key,
            avg: (.value.avg // "N/A"),
            min: (.value.min // "N/A"),
            med: (.value.med // "N/A"),
            max: (.value.max // "N/A"),
            p90: (.value["p(90)"] // "N/A"),
            p95: (.value["p(95)"] // "N/A")
        } | [.key, .avg, .min, .med, .max, .p90, .p95] | @tsv
    ' "$JSON_FILE"
}

extract_http_metrics() {
    jq -r '
        .metrics | to_entries[] |
        select(.key | test("^http_")) |
        {
            key: .key,
            avg: (.value.avg // "N/A"),
            min: (.value.min // "N/A"),
            med: (.value.med // "N/A"),
            max: (.value.max // "N/A"),
            p90: (.value["p(90)"] // "N/A"),
            p95: (.value["p(95)"] // "N/A")
        } | [.key, .avg, .min, .med, .max, .p90, .p95] | @tsv
    ' "$JSON_FILE"
}

extract_gas_metrics() {
    jq -r '
        .metrics | to_entries[] |
        select(.key | test("_gas$")) |
        {
            key: .key,
            value: (.value.value // "N/A"),
            min: (.value.min // "N/A"),
            max: (.value.max // "N/A")
        } | [.key, .value, .min, .max] | @tsv
    ' "$JSON_FILE"
}

print_error_rate_metrics() {
    local key percent passes fails
    while IFS=$'\t' read -r key percent passes fails; do
        printf "%-36s | %-10s | %-6s | %-6s\n" \
            "$(truncate_field "$key" 36)" \
            "$(truncate_field "$percent" 10)" \
            "$(truncate_field "$passes" 6)" \
            "$(truncate_field "$fails" 6)"
    done < <(extract_error_rate_metrics)
}

print_latency_metrics() {
    local key avg min med max p90 p95
    while IFS=$'\t' read -r key avg min med max p90 p95; do
        printf "%-36s | %-12s | %-12s | %-12s | %-12s | %-12s | %-12s\n" \
            "$(truncate_field "$key" 36)" \
            "$(truncate_field "$avg" 12)" \
            "$(truncate_field "$min" 12)" \
            "$(truncate_field "$med" 12)" \
            "$(truncate_field "$max" 12)" \
            "$(truncate_field "$p90" 12)" \
            "$(truncate_field "$p95" 12)"
    done < <(extract_latency_metrics)
}

print_http_metrics() {
    local key avg min med max p90 p95
    while IFS=$'\t' read -r key avg min med max p90 p95; do
        printf "%-36s | %-12s | %-12s | %-12s | %-12s | %-12s | %-12s\n" \
            "$(truncate_field "$key" 36)" \
            "$(truncate_field "$avg" 12)" \
            "$(truncate_field "$min" 12)" \
            "$(truncate_field "$med" 12)" \
            "$(truncate_field "$max" 12)" \
            "$(truncate_field "$p90" 12)" \
            "$(truncate_field "$p95" 12)"
    done < <(extract_http_metrics)
}

print_gas_metrics() {
    local key value min max
    while IFS=$'\t' read -r key value min max; do
        printf "%-36s | %-12s | %-12s | %-12s\n" \
            "$(truncate_field "$key" 36)" \
            "$(truncate_field "$value" 12)" \
            "$(truncate_field "$min" 12)" \
            "$(truncate_field "$max" 12)"
    done < <(extract_gas_metrics)
}

main() {
    if [[ ! -f "$JSON_FILE" ]]; then
        printf "Error: JSON file not found or not specified\n" >&2
        return 1
    fi

    if ! jq empty "$JSON_FILE" 2>/dev/null; then
        printf "Error: Invalid JSON file format\n" >&2
        return 1
    fi

    print_header_gas
    print_gas_metrics

    print_header_error_rate
    print_error_rate_metrics

    print_header_latency
    print_latency_metrics

    print_header_http
    print_http_metrics

}

main "$@"
