package vn.homecredit.englishcoach.backend.core.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Jwt jwt, Openai openai) {

    public record Jwt(String secret, long accessTokenMinutes) {
    }

    public record Openai(String apiKey, String model, String baseUrl, int timeoutMillis, int maxTokens) {
    }
}
