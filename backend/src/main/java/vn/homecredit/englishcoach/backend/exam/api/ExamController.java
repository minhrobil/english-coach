package vn.homecredit.englishcoach.backend.exam.api;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/exams")
public class ExamController {

    @PostMapping
    public ResponseEntity<CreateExamResponse> create(@RequestBody CreateExamRequest request) {
        return ResponseEntity.ok(new CreateExamResponse(
                UUID.randomUUID(),
                request.topicCode(),
                request.questionCount(),
                request.durationSeconds()
        ));
    }

    @PostMapping("/{examId}/finish")
    public ResponseEntity<FinishExamResponse> finish(@PathVariable UUID examId) {
        return ResponseEntity.ok(new FinishExamResponse(examId, Instant.now(), 78.5));
    }

    public record CreateExamRequest(@NotBlank String topicCode, @Min(1) int questionCount, @Min(30) int durationSeconds) {
    }

    public record CreateExamResponse(UUID examId, String topicCode, int questionCount, int durationSeconds) {
    }

    public record FinishExamResponse(UUID examId, Instant finishedAt, double overallScore) {
    }
}
