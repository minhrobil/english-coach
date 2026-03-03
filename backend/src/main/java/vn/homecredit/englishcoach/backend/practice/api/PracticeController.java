package vn.homecredit.englishcoach.backend.practice.api;

import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import vn.homecredit.englishcoach.backend.ai.adapter.OpenAiEvaluationClient;
import vn.homecredit.englishcoach.backend.core.security.CurrentUserService;
import vn.homecredit.englishcoach.backend.practice.service.PracticeSessionService;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/practice")
public class PracticeController {

    private final PracticeSessionService practiceSessionService;
    private final CurrentUserService currentUserService;

    public PracticeController(PracticeSessionService practiceSessionService, CurrentUserService currentUserService) {
        this.practiceSessionService = practiceSessionService;
        this.currentUserService = currentUserService;
    }

    @PostMapping("/instant-session")
    public ResponseEntity<PracticePromptResponse> createInstantSession(@RequestBody InstantSessionRequest request) {
        String userEmail = currentUserService.requireUserEmail();
        PracticeSessionService.PracticePromptData generated =
                practiceSessionService.createInstantPrompt(userEmail, request.topic(), request.level());

        return ResponseEntity.ok(new PracticePromptResponse(
                generated.promptId(),
                generated.direction(),
                generated.promptText(),
                generated.referenceAnswer(),
                generated.hint(),
                generated.issuedAt(),
                generated.topic(),
                generated.level()
        ));
    }

    @PostMapping("/next-prompt")
    public ResponseEntity<PracticePromptResponse> nextPrompt(@RequestBody(required = false) InstantSessionRequest request) {
        String userEmail = currentUserService.requireUserEmail();
        String topic = request != null && request.topic() != null && !request.topic().isBlank()
                ? request.topic()
                : "work";
        String level = request != null && request.level() != null && !request.level().isBlank()
                ? request.level()
                : "medium";
        PracticeSessionService.PracticePromptData generated =
                practiceSessionService.createInstantPrompt(userEmail, topic, level);

        return ResponseEntity.ok(new PracticePromptResponse(
                generated.promptId(),
                generated.direction(),
                generated.promptText(),
                generated.referenceAnswer(),
                generated.hint(),
                generated.issuedAt(),
                generated.topic(),
                generated.level()
        ));
    }

    @PostMapping("/submit")
    public ResponseEntity<PracticeSubmitResponse> submit(@RequestBody PracticeSubmitRequest request) {
        String userEmail = currentUserService.requireUserEmail();
        PracticeSessionService.PracticeSubmissionData evaluated =
                practiceSessionService.submitAndEvaluate(
                        userEmail,
                        request.promptId(),
                        request.sourceSentence(),
                        request.answerText(),
                        request.referenceAnswer()
                );

        return ResponseEntity.ok(new PracticeSubmitResponse(
                evaluated.answerId(),
                evaluated.promptId(),
                evaluated.evaluationStatus(),
                evaluated.overallScore(),
                evaluated.grammarScore(),
                evaluated.naturalnessScore(),
                evaluated.vocabularyScore(),
                evaluated.explanation(),
                evaluated.betterPhrasing(),
                evaluated.vocabularyHints(),
                evaluated.highlighted()
        ));
    }

    @GetMapping("/history")
    public ResponseEntity<List<PracticeHistoryItemResponse>> history(
            @RequestParam(name = "limit", defaultValue = "20") int limit) {
        String userEmail = currentUserService.requireUserEmail();
        List<PracticeHistoryItemResponse> response = practiceSessionService.getRecentHistory(userEmail, limit)
                .stream()
                .map(item -> new PracticeHistoryItemResponse(
                        item.answerId(),
                        item.promptId(),
                        item.sourceSentence(),
                        item.referenceAnswer(),
                        item.userAnswer(),
                        item.overallScore(),
                        item.grammarScore(),
                        item.naturalnessScore(),
                        item.vocabularyScore(),
                        item.explanation(),
                        item.betterPhrasing(),
                        item.vocabularyHints(),
                        item.highlighted(),
                        item.evaluationStatus(),
                        item.submittedAt()
                ))
                .toList();

        return ResponseEntity.ok(response);
    }

    @PostMapping("/history/highlight")
    public ResponseEntity<HighlightResponse> setHighlight(@RequestBody HighlightRequest request) {
        String userEmail = currentUserService.requireUserEmail();
        boolean changed = practiceSessionService.setHistoryHighlight(userEmail, request.answerId(), request.highlighted());
        return ResponseEntity.ok(new HighlightResponse(request.answerId(), request.highlighted(), changed));
    }

    @DeleteMapping("/history")
    public ResponseEntity<DeleteResponse> deleteHistory(@RequestBody DeleteHistoryRequest request) {
        String userEmail = currentUserService.requireUserEmail();
        int deleted = practiceSessionService.deleteHistory(userEmail, request.answerIds());
        return ResponseEntity.ok(new DeleteResponse(deleted));
    }

    @GetMapping("/config")
    public ResponseEntity<AppConfigResponse> getConfig() {
        String userEmail = currentUserService.requireUserEmail();
        PracticeSessionService.AppConfigData config = practiceSessionService.getUserConfig(userEmail);
        return ResponseEntity.ok(new AppConfigResponse(
                config.backendBaseUrl(),
                config.periodicEnabled(),
                config.periodicIntervalSeconds(),
                config.answerMode(),
                config.practiceTopic(),
                config.practiceLevel()
        ));
    }

    @PutMapping("/config")
    public ResponseEntity<AppConfigResponse> updateConfig(@RequestBody AppConfigRequest request) {
        String userEmail = currentUserService.requireUserEmail();
        PracticeSessionService.AppConfigData updated = practiceSessionService.upsertUserConfig(
                userEmail,
                new PracticeSessionService.AppConfigData(
                        request.backendBaseUrl(),
                        request.periodicEnabled(),
                        request.periodicIntervalSeconds(),
                        request.answerMode(),
                        request.practiceTopic(),
                        request.practiceLevel()
                )
        );
        return ResponseEntity.ok(new AppConfigResponse(
                updated.backendBaseUrl(),
                updated.periodicEnabled(),
                updated.periodicIntervalSeconds(),
                updated.answerMode(),
                updated.practiceTopic(),
                updated.practiceLevel()
        ));
    }

    @GetMapping("/manual-vocabulary")
    public ResponseEntity<List<ManualVocabularyResponse>> getManualVocabulary(
            @RequestParam(name = "limit", defaultValue = "200") int limit) {
        String userEmail = currentUserService.requireUserEmail();
        List<ManualVocabularyResponse> response = practiceSessionService.getManualVocabulary(userEmail, limit)
                .stream()
                .map(item -> new ManualVocabularyResponse(
                        item.sourceAnswerId(),
                        item.term(),
                        item.meaningVi(),
                        item.note(),
                        item.sourceContext(),
                        item.selectedAt()
                ))
                .toList();
        return ResponseEntity.ok(response);
    }

    @PostMapping("/manual-vocabulary")
    public ResponseEntity<ManualVocabularyResponse> addManualVocabulary(@RequestBody ManualVocabularyRequest request) {
        String userEmail = currentUserService.requireUserEmail();
        PracticeSessionService.ManualVocabularyData created = practiceSessionService.addManualVocabulary(
                userEmail,
                new PracticeSessionService.ManualVocabularyCreateData(
                        request.sourceAnswerId(),
                        request.term(),
                        request.meaningVi(),
                        request.note(),
                        request.sourceContext()
                )
        );
        return ResponseEntity.ok(new ManualVocabularyResponse(
                created.sourceAnswerId(),
                created.term(),
                created.meaningVi(),
                created.note(),
                created.sourceContext(),
                created.selectedAt()
        ));
    }

    @DeleteMapping("/manual-vocabulary")
    public ResponseEntity<DeleteResponse> deleteManualVocabulary(@RequestBody DeleteManualVocabularyRequest request) {
        String userEmail = currentUserService.requireUserEmail();
        int deleted = practiceSessionService.deleteManualVocabularyByKeys(
                userEmail,
                request.items().stream()
                        .map(i -> new PracticeSessionService.ManualVocabularyDeleteKey(i.sourceAnswerId(), i.term()))
                        .toList()
        );
        return ResponseEntity.ok(new DeleteResponse(deleted));
    }

    @GetMapping("/review/summary")
    public ResponseEntity<ReviewSummaryResponse> getReviewSummary() {
        String userEmail = currentUserService.requireUserEmail();
        PracticeSessionService.ReviewSummaryData summary = practiceSessionService.getReviewSummary(userEmail);
        return ResponseEntity.ok(new ReviewSummaryResponse(
                summary.dueCount(),
                summary.overdueCount(),
                summary.newCount(),
                summary.todayReviewedCount(),
                summary.retentionRate30d(),
                summary.streakDays(),
                summary.generatedAt()
        ));
    }

    @GetMapping("/review/session")
    public ResponseEntity<List<ReviewCardResponse>> getReviewSession(
            @RequestParam(name = "limit", defaultValue = "10") int limit) {
        String userEmail = currentUserService.requireUserEmail();
        List<ReviewCardResponse> response = practiceSessionService.getReviewSession(userEmail, limit)
                .stream()
                .map(card -> new ReviewCardResponse(
                        card.cardId(),
                        card.sourceAnswerId(),
                        card.term(),
                        card.meaningVi(),
                        card.note(),
                        card.sourceContext(),
                        card.easeFactor(),
                        card.intervalDays(),
                        card.repetition(),
                        card.dueAt(),
                        card.lastReviewedAt(),
                        card.reviewCount(),
                        card.lapseCount(),
                        card.state()
                ))
                .toList();
        return ResponseEntity.ok(response);
    }

    @PostMapping("/review/grade")
    public ResponseEntity<ReviewGradeResponse> gradeReviewCard(@RequestBody ReviewGradeRequest request) {
        String userEmail = currentUserService.requireUserEmail();
        PracticeSessionService.ReviewGradeData graded =
                practiceSessionService.gradeReviewCard(userEmail, request.cardId(), request.quality());
        PracticeSessionService.ReviewCardData card = graded.card();
        return ResponseEntity.ok(new ReviewGradeResponse(
                graded.quality(),
                graded.nextDueAt(),
                new ReviewCardResponse(
                        card.cardId(),
                        card.sourceAnswerId(),
                        card.term(),
                        card.meaningVi(),
                        card.note(),
                        card.sourceContext(),
                        card.easeFactor(),
                        card.intervalDays(),
                        card.repetition(),
                        card.dueAt(),
                        card.lastReviewedAt(),
                        card.reviewCount(),
                        card.lapseCount(),
                        card.state()
                )
        ));
    }

    public record InstantSessionRequest(String topic, String level) {
    }

    public record PracticeSubmitRequest(UUID promptId,
                                        @NotBlank String sourceSentence,
                                        @NotBlank String referenceAnswer,
                                        @NotBlank String answerText) {
    }

    public record PracticePromptResponse(UUID promptId,
                                         String direction,
                                         String promptText,
                                         String referenceAnswer,
                                         OpenAiEvaluationClient.PromptHint hint,
                                         Instant issuedAt,
                                         String topic,
                                         String level) {
    }

    public record PracticeSubmitResponse(UUID answerId,
                                         UUID promptId,
                                         String evaluationStatus,
                                         int overallScore,
                                         int grammarScore,
                                         int naturalnessScore,
                                         int vocabularyScore,
                                         String explanation,
                                         String betterPhrasing,
                                         List<OpenAiEvaluationClient.VocabularyHint> vocabularyHints,
                                         boolean highlighted) {
    }

    public record PracticeHistoryItemResponse(UUID answerId,
                                              UUID promptId,
                                              String sourceSentence,
                                              String referenceAnswer,
                                              String userAnswer,
                                              int overallScore,
                                              int grammarScore,
                                              int naturalnessScore,
                                               int vocabularyScore,
                                                String explanation,
                                                String betterPhrasing,
                                                List<OpenAiEvaluationClient.VocabularyHint> vocabularyHints,
                                                boolean highlighted,
                                                String evaluationStatus,
                                                Instant submittedAt) {
    }

    public record HighlightRequest(UUID answerId, boolean highlighted) {
    }

    public record HighlightResponse(UUID answerId, boolean highlighted, boolean changed) {
    }

    public record DeleteHistoryRequest(List<UUID> answerIds) {
    }

    public record AppConfigRequest(String backendBaseUrl,
                                   boolean periodicEnabled,
                                   int periodicIntervalSeconds,
                                   String answerMode,
                                   String practiceTopic,
                                   String practiceLevel) {
    }

    public record AppConfigResponse(String backendBaseUrl,
                                    boolean periodicEnabled,
                                    int periodicIntervalSeconds,
                                    String answerMode,
                                    String practiceTopic,
                                    String practiceLevel) {
    }

    public record ManualVocabularyRequest(UUID sourceAnswerId,
                                          String term,
                                          String meaningVi,
                                          String note,
                                          String sourceContext) {
    }

    public record ManualVocabularyResponse(UUID sourceAnswerId,
                                           String term,
                                           String meaningVi,
                                           String note,
                                           String sourceContext,
                                           Instant selectedAt) {
    }

    public record DeleteManualVocabularyRequest(List<ManualVocabularyDeleteItem> items) {
    }

    public record ManualVocabularyDeleteItem(UUID sourceAnswerId, String term) {
    }

    public record DeleteResponse(int deletedCount) {
    }

    public record ReviewSummaryResponse(int dueCount,
                                        int overdueCount,
                                        int newCount,
                                        int todayReviewedCount,
                                        double retentionRate30d,
                                        int streakDays,
                                        Instant generatedAt) {
    }

    public record ReviewCardResponse(UUID cardId,
                                     UUID sourceAnswerId,
                                     String term,
                                     String meaningVi,
                                     String note,
                                     String sourceContext,
                                     double easeFactor,
                                     int intervalDays,
                                     int repetition,
                                     Instant dueAt,
                                     Instant lastReviewedAt,
                                     int reviewCount,
                                     int lapseCount,
                                     String state) {
    }

    public record ReviewGradeRequest(UUID cardId, int quality) {
    }

    public record ReviewGradeResponse(int quality, Instant nextDueAt, ReviewCardResponse card) {
    }
}
