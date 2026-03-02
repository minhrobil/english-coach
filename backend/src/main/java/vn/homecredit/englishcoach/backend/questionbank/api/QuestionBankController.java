package vn.homecredit.englishcoach.backend.questionbank.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/questions")
public class QuestionBankController {

    @GetMapping
    public ResponseEntity<List<QuestionItemResponse>> list() {
        return ResponseEntity.ok(List.of(
                new QuestionItemResponse(UUID.randomUUID(), "work", "vi_to_en", "Hôm nay bạn thế nào?", "How are you today?", "easy")
        ));
    }

    @PostMapping
    public ResponseEntity<QuestionItemResponse> create(@RequestBody CreateQuestionRequest request) {
        return ResponseEntity.ok(new QuestionItemResponse(
                UUID.randomUUID(),
                request.topicCode(),
                request.translationDirection(),
                request.promptText(),
                request.referenceAnswer(),
                request.difficulty()
        ));
    }

    public record CreateQuestionRequest(
            @NotBlank String topicCode,
            @NotBlank String translationDirection,
            @NotBlank String promptText,
            @NotBlank String referenceAnswer,
            @NotNull String difficulty
    ) {
    }

    public record QuestionItemResponse(
            UUID id,
            String topicCode,
            String translationDirection,
            String promptText,
            String referenceAnswer,
            String difficulty
    ) {
    }
}
