package vn.homecredit.englishcoach.backend.auth.api;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import vn.homecredit.englishcoach.backend.core.security.JwtTokenService;

import java.util.List;

@Validated
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final JwtTokenService jwtTokenService;

    public AuthController(JwtTokenService jwtTokenService) {
        this.jwtTokenService = jwtTokenService;
    }

    @PostMapping("/signin")
    public ResponseEntity<SignInResponse> signIn(@RequestBody SignInRequest request) {
        String token = jwtTokenService.generateAccessToken(request.email(), List.of("ROLE_USER"));
        return ResponseEntity.ok(new SignInResponse(token, "Bearer", 3600));
    }

    @PostMapping("/signout")
    public ResponseEntity<Void> signOut() {
        return ResponseEntity.noContent().build();
    }

    public record SignInRequest(@NotBlank @Email String email, @NotBlank String password) {
    }

    public record SignInResponse(String accessToken, String tokenType, long expiresInSeconds) {
    }
}
