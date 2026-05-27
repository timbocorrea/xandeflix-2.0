package com.xandeflix.app;

import android.net.Uri;

import androidx.media3.common.PlaybackException;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;

import java.net.URL;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

final class NativeStreamRequest {
    private static final String DEFAULT_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 12; Fire TV) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36";

    private final String rawUrl;
    private final String mediaUrl;
    private final String userAgent;
    private final Map<String, String> requestHeaders;
    private final boolean hasPipeHeaders;
    private final int candidateIndex;
    private final int candidateCount;

    private NativeStreamRequest(
            String rawUrl,
            String mediaUrl,
            String userAgent,
            Map<String, String> requestHeaders,
            boolean hasPipeHeaders,
            int candidateIndex,
            int candidateCount
    ) {
        this.rawUrl = rawUrl;
        this.mediaUrl = mediaUrl;
        this.userAgent = userAgent;
        this.requestHeaders = requestHeaders;
        this.hasPipeHeaders = hasPipeHeaders;
        this.candidateIndex = candidateIndex;
        this.candidateCount = candidateCount;
    }

    static List<NativeStreamRequest> fromRawUrl(String rawUrl) {
        ParsedRawStream parsedStream = parseRawStream(rawUrl);
        List<String> candidateUrls = buildCandidateUrls(parsedStream.mediaUrl);
        List<NativeStreamRequest> requests = new ArrayList<>();

        for (int index = 0; index < candidateUrls.size(); index += 1) {
            requests.add(
                    new NativeStreamRequest(
                            rawUrl,
                            candidateUrls.get(index),
                            parsedStream.userAgent,
                            parsedStream.requestHeaders,
                            parsedStream.hasPipeHeaders,
                            index + 1,
                            candidateUrls.size()
                    )
            );
        }

        return requests;
    }

    String getRawUrl() {
        return rawUrl;
    }

    String getMediaUrl() {
        return mediaUrl;
    }

    String getMaskedUrl() {
        return maskStreamUrl(mediaUrl);
    }

    int getCandidateIndex() {
        return candidateIndex;
    }

    int getCandidateCount() {
        return candidateCount;
    }

    String getHeaderSummary() {
        List<String> headerNames = new ArrayList<>(requestHeaders.keySet());

        if (!DEFAULT_USER_AGENT.equals(userAgent)) {
            headerNames.add("User-Agent");
        }

        if (headerNames.isEmpty()) {
            return "none";
        }

        return headerNames.toString() + " pipeHeaders=" + hasPipeHeaders;
    }

    DefaultHttpDataSource.Factory createHttpDataSourceFactory() {
        return new DefaultHttpDataSource.Factory()
                .setUserAgent(userAgent)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(30000)
                .setReadTimeoutMs(30000)
                .setDefaultRequestProperties(new LinkedHashMap<>(requestHeaders));
    }

    static boolean shouldTryNextCandidate(PlaybackException error) {
        return error != null
                && (
                error.errorCode == PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS
                        || findInvalidResponseCodeException(error) != null
        );
    }

    static HttpDataSource.InvalidResponseCodeException findInvalidResponseCodeException(Throwable error) {
        Throwable current = error;

        while (current != null) {
            if (current instanceof HttpDataSource.InvalidResponseCodeException) {
                return (HttpDataSource.InvalidResponseCodeException) current;
            }

            current = current.getCause();
        }

        return null;
    }

    static String describeHttpStatus(Throwable error) {
        HttpDataSource.InvalidResponseCodeException responseError =
                findInvalidResponseCodeException(error);

        if (responseError == null) {
            return "unknown";
        }

        return String.valueOf(responseError.responseCode);
    }

    static String maskStreamUrl(String url) {
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme() != null ? uri.getScheme() : "unknown";
            String host = uri.getHost() != null ? uri.getHost() : "unknown-host";
            String lastSegment = uri.getLastPathSegment() != null ? uri.getLastPathSegment() : "";

            if (lastSegment.isEmpty()) {
                return scheme + "://" + host + "/...";
            }

            return scheme + "://" + host + "/.../" + lastSegment;
        } catch (Exception error) {
            return "[invalid-url]";
        }
    }

    private static ParsedRawStream parseRawStream(String rawUrl) {
        String trimmedUrl = rawUrl != null ? rawUrl.trim() : "";
        String[] parts = trimmedUrl.split("\\|");
        String mediaUrl = parts.length > 0 ? parts[0].trim() : trimmedUrl;
        Map<String, String> parsedHeaders = new LinkedHashMap<>();

        for (int index = 1; index < parts.length; index += 1) {
            parseHeaderPart(parts[index], parsedHeaders);
        }

        String userAgent = DEFAULT_USER_AGENT;
        String userAgentOverride = parsedHeaders.remove("User-Agent");

        if (userAgentOverride != null && !userAgentOverride.trim().isEmpty()) {
            userAgent = userAgentOverride.trim();
        }

        Map<String, String> requestHeaders = new LinkedHashMap<>();
        requestHeaders.put("Accept", "*/*");
        requestHeaders.put("Connection", "keep-alive");
        requestHeaders.putAll(parsedHeaders);

        return new ParsedRawStream(
                mediaUrl,
                userAgent,
                requestHeaders,
                parts.length > 1
        );
    }

    private static void parseHeaderPart(String headerPart, Map<String, String> parsedHeaders) {
        if (headerPart == null || headerPart.trim().isEmpty()) {
            return;
        }

        String[] assignments = headerPart.split("&");

        for (String assignment : assignments) {
            int equalsIndex = assignment.indexOf('=');

            if (equalsIndex <= 0 || equalsIndex >= assignment.length() - 1) {
                continue;
            }

            String rawName = decodeHeaderValue(assignment.substring(0, equalsIndex));
            String rawValue = decodeHeaderValue(assignment.substring(equalsIndex + 1));
            String headerName = normalizeHeaderName(rawName);
            String headerValue = sanitizeHeaderValue(rawValue);

            if (headerName.isEmpty() || headerValue.isEmpty()) {
                continue;
            }

            parsedHeaders.put(headerName, headerValue);
        }
    }

    private static String decodeHeaderValue(String value) {
        try {
            return Uri.decode(value != null ? value.trim() : "");
        } catch (Exception error) {
            return value != null ? value.trim() : "";
        }
    }

    private static String normalizeHeaderName(String headerName) {
        if (headerName == null) {
            return "";
        }

        String trimmedName = headerName.trim();

        if (!isHeaderNameSafe(trimmedName)) {
            return "";
        }

        String normalizedName = trimmedName.toLowerCase(Locale.US).replace('_', '-');

        if ("user-agent".equals(normalizedName) || "useragent".equals(normalizedName)) {
            return "User-Agent";
        }

        if ("referer".equals(normalizedName) || "referrer".equals(normalizedName)) {
            return "Referer";
        }

        if ("origin".equals(normalizedName)) {
            return "Origin";
        }

        if ("accept".equals(normalizedName)) {
            return "Accept";
        }

        if ("connection".equals(normalizedName)) {
            return "Connection";
        }

        return trimmedName;
    }

    private static boolean isHeaderNameSafe(String headerName) {
        return headerName != null
                && !headerName.isEmpty()
                && headerName.indexOf('\r') == -1
                && headerName.indexOf('\n') == -1
                && headerName.indexOf(':') == -1;
    }

    private static String sanitizeHeaderValue(String headerValue) {
        if (headerValue == null) {
            return "";
        }

        return headerValue
                .replace("\r", "")
                .replace("\n", "")
                .trim();
    }

    private static List<String> buildCandidateUrls(String mediaUrl) {
        List<String> candidates = new ArrayList<>();
        addUnique(candidates, mediaUrl);

        try {
            URL parsedUrl = new URL(mediaUrl);
            List<String> segments = splitPathSegments(parsedUrl.getPath());

            if (segments.size() >= 3) {
                String streamId = segments.get(segments.size() - 1);
                String password = segments.get(segments.size() - 2);
                String username = segments.get(segments.size() - 3);
                String firstSegment = segments.get(0).toLowerCase(Locale.US);
                String origin = parsedUrl.getProtocol() + "://" + parsedUrl.getAuthority();
                String querySuffix = parsedUrl.getQuery() != null ? "?" + parsedUrl.getQuery() : "";
                boolean isKnownTypedPath =
                        "live".equals(firstSegment)
                                || "movie".equals(firstSegment)
                                || "series".equals(firstSegment)
                                || "vod".equals(firstSegment);

                if (!isKnownTypedPath && isNumericStreamId(streamId)) {
                    addUnique(
                            candidates,
                            origin + "/live/" + username + "/" + password + "/" + streamId + ".ts" + querySuffix
                    );
                    addUnique(
                            candidates,
                            origin + "/live/" + username + "/" + password + "/" + streamId + querySuffix
                    );
                    addUnique(
                            candidates,
                            origin + "/" + username + "/" + password + "/" + streamId + ".ts" + querySuffix
                    );
                }

                if ("live".equals(firstSegment) && isNumericStreamId(streamId)) {
                    addUnique(
                            candidates,
                            origin + buildPathPrefix(segments) + "/" + streamId + ".ts" + querySuffix
                    );
                }
            }
        } catch (Exception error) {
            return candidates;
        }

        return candidates;
    }

    private static List<String> splitPathSegments(String path) {
        String[] rawSegments = path != null ? path.split("/") : new String[0];
        List<String> segments = new ArrayList<>();

        for (String rawSegment : rawSegments) {
            String segment = rawSegment != null ? rawSegment.trim() : "";

            if (!segment.isEmpty()) {
                segments.add(segment);
            }
        }

        return segments;
    }

    private static String buildPathPrefix(List<String> segments) {
        StringBuilder builder = new StringBuilder();

        for (int index = 0; index < segments.size() - 1; index += 1) {
            builder.append("/").append(segments.get(index));
        }

        return builder.toString();
    }

    private static boolean isNumericStreamId(String value) {
        return value != null && value.matches("^\\d+$");
    }

    private static void addUnique(List<String> values, String value) {
        if (value == null || value.trim().isEmpty()) {
            return;
        }

        String trimmedValue = value.trim();

        if (!values.contains(trimmedValue)) {
            values.add(trimmedValue);
        }
    }

    private static final class ParsedRawStream {
        private final String mediaUrl;
        private final String userAgent;
        private final Map<String, String> requestHeaders;
        private final boolean hasPipeHeaders;

        private ParsedRawStream(
                String mediaUrl,
                String userAgent,
                Map<String, String> requestHeaders,
                boolean hasPipeHeaders
        ) {
            this.mediaUrl = mediaUrl;
            this.userAgent = userAgent;
            this.requestHeaders = requestHeaders;
            this.hasPipeHeaders = hasPipeHeaders;
        }
    }
}
