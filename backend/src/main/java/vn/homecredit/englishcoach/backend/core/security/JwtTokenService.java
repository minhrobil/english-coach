package vn.homecredit.englishcoach.backend.core.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;
import vn.homecredit.englishcoach.backend.core.config.AppProperties;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Optional;

@Service
public class JwtTokenService {

    private final AppProperties appProperties;

    public JwtTokenService(AppProperties appProperties) {
        this.appProperties = appProperties;
    }

    public String generateAccessToken(String subject, List<String> roles) {
        Instant now = Instant.now();
        Instant expiredAt = now.plusSeconds(appProperties.jwt().accessTokenMinutes() * 60);

        return Jwts.builder()
                .subject(subject)
                .claim("roles", roles)
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiredAt))
                .signWith(secretKey())
                .compact();
    }

    public Optional<AccessTokenPayload> parseAccessToken(String token) {
        try {
            Jws<Claims> claimsJws = Jwts.parser()
                    .verifyWith(secretKey())
                    .build()
                    .parseSignedClaims(token);

            Claims claims = claimsJws.getPayload();
            String subject = claims.getSubject();

            @SuppressWarnings("unchecked")
            List<String> roles = (List<String>) claims.get("roles", List.class);

            if (subject == null || subject.isBlank()) {
                return Optional.empty();
            }

            return Optional.of(new AccessTokenPayload(
                    subject,
                    roles == null ? List.of() : roles
            ));
        } catch (JwtException | IllegalArgumentException ex) {
            return Optional.empty();
        }
    }

    private SecretKey secretKey() {
        byte[] keyBytes = Decoders.BASE64.decode(appProperties.jwt().secret());
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public record AccessTokenPayload(String subject, List<String> roles) {
    }
}
