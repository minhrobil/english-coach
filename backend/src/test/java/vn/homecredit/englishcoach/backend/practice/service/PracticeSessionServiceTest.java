package vn.homecredit.englishcoach.backend.practice.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import vn.homecredit.englishcoach.backend.ai.adapter.OpenAiEvaluationClient;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PracticeSessionServiceTest {

    @Mock
    private OpenAiEvaluationClient openAiEvaluationClient;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private PracticeSessionService service;

    @BeforeEach
    void setUp() {
        service = new PracticeSessionService(openAiEvaluationClient, jdbcTemplate);
    }

    @Test
    void createInstantPrompt_retriesWhenCandidateTooSimilarToRecentPrompt() {
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any())).thenAnswer(invocation -> {
            RowMapper<String> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getString("source_sentence")).thenReturn("Bệnh viện cần tăng cường phòng ngừa lây nhiễm trong mùa dịch.");
            return List.of(mapper.mapRow(rs, 0));
        });

        OpenAiEvaluationClient.GeneratedPrompt tooSimilar = new OpenAiEvaluationClient.GeneratedPrompt(
                "vi_to_en",
                "Bệnh viện cần tăng cường phòng ngừa lây nhiễm cho bệnh nhân trong mùa dịch.",
                "The hospital needs to strengthen infection prevention for patients during the outbreak season.",
                new OpenAiEvaluationClient.PromptHint(
                        "Need to + verb",
                        "Subject + need(s) to + base verb + object",
                        List.of("hospital", "infection prevention", "patients"),
                        "Dùng để diễn tả nhu cầu cần làm gì."
                ),
                List.of("hospital", "infection", "patients")
        );

        OpenAiEvaluationClient.GeneratedPrompt accepted = new OpenAiEvaluationClient.GeneratedPrompt(
                "vi_to_en",
                "Bệnh viện nên nâng cấp quy trình tiếp nhận cấp cứu để rút ngắn thời gian chờ.",
                "The hospital should upgrade the emergency intake process to reduce waiting time.",
                new OpenAiEvaluationClient.PromptHint(
                        "Should + base verb",
                        "Subject + should + base verb + object",
                        List.of("hospital", "emergency intake", "waiting time"),
                        "Dùng should để đề xuất giải pháp."
                ),
                List.of("emergency intake", "waiting time", "process")
        );

        when(openAiEvaluationClient.generatePrompt(any())).thenReturn(tooSimilar, accepted);

        PracticeSessionService.PracticePromptData result = service.createInstantPrompt("healthcare", "medium");

        assertEquals(accepted.promptText(), result.promptText());
        verify(openAiEvaluationClient, times(2)).generatePrompt(any());
    }

    @Test
    void createInstantPrompt_usesCoreKeywordsFromPreviousPromptAsExcludedWords() {
        doReturn(List.of("Nội dung bất kỳ"))
                .when(jdbcTemplate)
                .query(anyString(), any(RowMapper.class), any());

        OpenAiEvaluationClient.GeneratedPrompt firstAccepted = new OpenAiEvaluationClient.GeneratedPrompt(
                "vi_to_en",
                "Bệnh viện cần tối ưu phân luồng bệnh nhân tại khu khám ngoại trú.",
                "The hospital needs to optimize patient flow in the outpatient department.",
                new OpenAiEvaluationClient.PromptHint(
                        "Need to + verb",
                        "Subject + need(s) to + base verb + object",
                        List.of("hospital", "patient flow", "outpatient"),
                        "Mẫu diễn tả nhu cầu cải thiện vận hành."
                ),
                List.of("hospital", "patient", "outpatient")
        );

        OpenAiEvaluationClient.GeneratedPrompt overlappedKeywords = new OpenAiEvaluationClient.GeneratedPrompt(
                "vi_to_en",
                "Bệnh viện cần chuẩn hóa biểu mẫu giao tiếp với bệnh nhân.",
                "The hospital needs to standardize communication templates with patients.",
                new OpenAiEvaluationClient.PromptHint(
                        "Need to + verb",
                        "Subject + need(s) to + base verb + object",
                        List.of("hospital", "communication templates", "patients"),
                        "Mẫu đề xuất chuẩn hóa quy trình."
                ),
                List.of("hospital", "patient", "templates")
        );

        OpenAiEvaluationClient.GeneratedPrompt secondAccepted = new OpenAiEvaluationClient.GeneratedPrompt(
                "vi_to_en",
                "Bệnh viện nên tăng cường đào tạo xử lý sự cố hệ thống hồ sơ điện tử.",
                "The hospital should strengthen training on incident handling in electronic medical records.",
                new OpenAiEvaluationClient.PromptHint(
                        "Should + base verb",
                        "Subject + should + base verb + object",
                        List.of("training", "incident handling", "electronic records"),
                        "Đề xuất hành động ưu tiên."
                ),
                List.of("training", "incident handling", "electronic records")
        );

        when(openAiEvaluationClient.generatePrompt(any()))
                .thenReturn(firstAccepted, overlappedKeywords, secondAccepted);

        service.createInstantPrompt("healthcare", "medium");
        PracticeSessionService.PracticePromptData result = service.createInstantPrompt("healthcare", "medium");

        ArgumentCaptor<OpenAiEvaluationClient.GeneratePromptRequest> captor =
                ArgumentCaptor.forClass(OpenAiEvaluationClient.GeneratePromptRequest.class);
        verify(openAiEvaluationClient, times(3)).generatePrompt(captor.capture());

        OpenAiEvaluationClient.GeneratePromptRequest secondCallFirstAttempt = captor.getAllValues().get(1);
        assertTrue(secondCallFirstAttempt.excludedWords().contains("hospital"));
        assertTrue(secondCallFirstAttempt.excludedWords().contains("patient"));
        assertEquals(secondAccepted.promptText(), result.promptText());
    }

    @Test
    void deleteHistory_returnsZeroWhenInputIsEmpty() {
        int deleted = service.deleteHistory("user@test.com", List.of());

        assertEquals(0, deleted);
    }

    @Test
    void getUserConfig_returnsDefaultWhenNoConfigInDatabase() {
        doReturn(List.of())
                .when(jdbcTemplate)
                .query(anyString(), any(RowMapper.class), any());

        PracticeSessionService.AppConfigData config = service.getUserConfig("user@test.com");

        assertEquals("http://localhost:8088", config.backendBaseUrl());
        assertEquals("medium", config.practiceLevel());
    }

    @Test
    void upsertUserConfig_normalizesInvalidLevelToMedium() {
        doReturn(1)
                .when(jdbcTemplate)
                .update(anyString(), any(), any(), any(), any(), any(), any(), any());

        PracticeSessionService.AppConfigData result = service.upsertUserConfig(
                "user@test.com",
                new PracticeSessionService.AppConfigData(
                        "http://localhost:8088",
                        true,
                        45,
                        "MULTIPLE_CHOICE",
                        "healthcare",
                        "invalid-level"
                )
        );

        assertEquals("medium", result.practiceLevel());
    }

    @Test
    void removeManualVocabulary_returnsFalseWhenNothingDeleted() {
        doReturn(0)
                .when(jdbcTemplate)
                .update(anyString(), ArgumentMatchers.<Object[]>any());

        boolean removed = service.removeManualVocabulary("user@test.com", UUID.randomUUID(), "term");

        assertFalse(removed);
    }

    @Test
    void deleteManualVocabularyByKeys_returnsZeroWhenInputIsEmpty() {
        int deleted = service.deleteManualVocabularyByKeys("user@test.com", List.of());

        assertEquals(0, deleted);
    }

    @Test
    void gradeReviewCard_throwsWhenCardNotFound() {
        doReturn(List.of())
                .when(jdbcTemplate)
                .query(anyString(), any(RowMapper.class), any(), any());

        assertThrows(IllegalArgumentException.class,
                () -> service.gradeReviewCard("user@test.com", UUID.randomUUID(), 5));
    }

    @Test
    void gradeReviewCard_setsLearningStateWhenQualityLow() {
        UUID cardId = UUID.randomUUID();
        PracticeSessionService.ReviewCardData current = new PracticeSessionService.ReviewCardData(
                cardId,
                UUID.randomUUID(),
                "triage",
                "phân loại",
                "",
                "",
                2.5,
                4,
                3,
                Instant.now(),
                null,
                2,
                1,
                "REVIEW"
        );
        doReturn(List.of(current))
                .when(jdbcTemplate)
                .query(anyString(), any(RowMapper.class), any(), any());
        doReturn(1)
                .when(jdbcTemplate)
                .update(anyString(), ArgumentMatchers.<Object[]>any());

        PracticeSessionService.ReviewGradeData result = service.gradeReviewCard("user@test.com", cardId, 1);

        assertEquals(1, result.quality());
        assertEquals("LEARNING", result.card().state());
        assertEquals(1, result.card().intervalDays());
        assertEquals(0, result.card().repetition());
    }

    @Test
    void gradeReviewCard_setsReviewStateWhenQualityHigh() {
        UUID cardId = UUID.randomUUID();
        PracticeSessionService.ReviewCardData current = new PracticeSessionService.ReviewCardData(
                cardId,
                UUID.randomUUID(),
                "workflow",
                "quy trình",
                "",
                "",
                2.5,
                3,
                1,
                Instant.now(),
                null,
                5,
                0,
                "LEARNING"
        );
        doReturn(List.of(current))
                .when(jdbcTemplate)
                .query(anyString(), any(RowMapper.class), any(), any());
        doReturn(1)
                .when(jdbcTemplate)
                .update(anyString(), ArgumentMatchers.<Object[]>any());

        PracticeSessionService.ReviewGradeData result = service.gradeReviewCard("user@test.com", cardId, 5);

        assertEquals(5, result.quality());
        assertEquals("REVIEW", result.card().state());
        assertEquals(3, result.card().intervalDays());
        assertEquals(2, result.card().repetition());
    }

    @Test
    void submitAndEvaluate_persistsHistoryAndReturnsData() {
        OpenAiEvaluationClient.EvaluationResult evaluated = new OpenAiEvaluationClient.EvaluationResult(
                80,
                82,
                85,
                82,
                "Good",
                "A better sentence",
                List.of(new OpenAiEvaluationClient.VocabularyHint("triage", "phân loại", "y tế"))
        );
        when(openAiEvaluationClient.evaluate(any())).thenReturn(evaluated);
        PracticeSessionService.PracticeSubmissionData result = service.submitAndEvaluate(
                "user@test.com",
                UUID.randomUUID(),
                "Câu gốc",
                "Câu trả lời",
                "Câu tham chiếu"
        );

        assertEquals(82, result.overallScore());
        assertEquals("COMPLETED", result.evaluationStatus());
        assertFalse(result.vocabularyHints().isEmpty());
    }

    @Test
    void setHistoryHighlight_returnsFalseWhenNoRowChanged() {
        boolean changed = service.setHistoryHighlight("user@test.com", UUID.randomUUID(), true);

        assertFalse(changed);
    }

    @Test
    void getRecentHistory_returnsMappedRowsFromDatabase() {
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(), any())).thenAnswer(invocation -> {
            RowMapper<PracticeSessionService.PracticeHistoryItemData> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            Timestamp now = Timestamp.from(Instant.now());
            when(rs.getObject("answer_id", UUID.class)).thenReturn(UUID.randomUUID());
            when(rs.getObject("prompt_id", UUID.class)).thenReturn(UUID.randomUUID());
            when(rs.getString("source_sentence")).thenReturn("source");
            when(rs.getString("reference_answer")).thenReturn("ref");
            when(rs.getString("user_answer")).thenReturn("answer");
            when(rs.getInt("overall_score")).thenReturn(80);
            when(rs.getInt("grammar_score")).thenReturn(80);
            when(rs.getInt("naturalness_score")).thenReturn(80);
            when(rs.getInt("vocabulary_score")).thenReturn(80);
            when(rs.getString("explanation")).thenReturn("explain");
            when(rs.getString("better_phrasing")).thenReturn("better");
            when(rs.getString("vocabulary_hints_json")).thenReturn("[{\"term\":\"triage\",\"meaningVi\":\"phân loại\",\"note\":\"y tế\"}]");
            when(rs.getBoolean("highlighted")).thenReturn(false);
            when(rs.getString("evaluation_status")).thenReturn("COMPLETED");
            when(rs.getTimestamp("submitted_at")).thenReturn(now);
            return List.of(mapper.mapRow(rs, 0));
        });

        List<PracticeSessionService.PracticeHistoryItemData> rows = service.getRecentHistory("user@test.com", 10);

        assertEquals(1, rows.size());
        assertEquals("source", rows.get(0).sourceSentence());
    }

    @Test
    void deleteHistory_deletesAllRequestedIds() {
        int deleted = service.deleteHistory("user@test.com", List.of(UUID.randomUUID(), UUID.randomUUID()));

        assertEquals(0, deleted);
    }

    @Test
    void getManualVocabulary_returnsRows() {
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(), any())).thenAnswer(invocation -> {
            RowMapper<PracticeSessionService.ManualVocabularyData> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("source_answer_id", UUID.class)).thenReturn(UUID.randomUUID());
            when(rs.getString("term")).thenReturn("triage");
            when(rs.getString("meaning_vi")).thenReturn("phân loại");
            when(rs.getString("note")).thenReturn("");
            when(rs.getString("source_context")).thenReturn("context");
            when(rs.getTimestamp("selected_at")).thenReturn(Timestamp.from(Instant.now()));
            return List.of(mapper.mapRow(rs, 0));
        });

        List<PracticeSessionService.ManualVocabularyData> rows = service.getManualVocabulary("user@test.com", 20);

        assertEquals(1, rows.size());
        assertEquals("triage", rows.get(0).term());
    }

    @Test
    void addManualVocabulary_upsertsAndReturnsCreatedItem() {
        doReturn(1)
                .when(jdbcTemplate)
                .update(anyString(), ArgumentMatchers.<Object[]>any());

        PracticeSessionService.ManualVocabularyData result = service.addManualVocabulary(
                "user@test.com",
                new PracticeSessionService.ManualVocabularyCreateData(
                        UUID.randomUUID(),
                        "workflow",
                        "quy trình",
                        "ghi chú",
                        "context"
                )
        );

        assertEquals("workflow", result.term());
        assertNotNull(result.selectedAt());
    }

    @Test
    void removeManualVocabulary_returnsTrueWhenDeleted() {
        boolean removed = service.removeManualVocabulary("user@test.com", UUID.randomUUID(), "term");

        assertFalse(removed);
    }

    @Test
    void deleteManualVocabularyByKeys_returnsDeleteCount() {
        int deleted = service.deleteManualVocabularyByKeys(
                "user@test.com",
                List.of(
                        new PracticeSessionService.ManualVocabularyDeleteKey(UUID.randomUUID(), "a"),
                        new PracticeSessionService.ManualVocabularyDeleteKey(UUID.randomUUID(), "b")
                )
        );

        assertEquals(0, deleted);
    }

    @Test
    void getReviewSummary_returnsComputedMetrics() {
        doReturn(1)
                .when(jdbcTemplate)
                .update(anyString(), ArgumentMatchers.<Object[]>any());
        doReturn(5)
                .when(jdbcTemplate)
                .queryForObject(anyString(), any(Class.class), any());
        when(jdbcTemplate.queryForObject(anyString(), any(RowMapper.class), any())).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getInt("total_count")).thenReturn(10);
            when(rs.getInt("success_count")).thenReturn(8);
            return mapper.mapRow(rs, 0);
        });
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any())).thenAnswer(invocation -> {
            RowMapper<LocalDate> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getDate("reviewed_date")).thenReturn(Date.valueOf(LocalDate.now()));
            return List.of(mapper.mapRow(rs, 0));
        });

        PracticeSessionService.ReviewSummaryData summary = service.getReviewSummary("user@test.com");

        assertEquals(5, summary.dueCount());
        assertEquals(80.0d, summary.retentionRate30d());
    }

    @Test
    void getReviewSession_returnsDueCards() {
        doReturn(1)
                .when(jdbcTemplate)
                .update(anyString(), ArgumentMatchers.<Object[]>any());
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(), any())).thenAnswer(invocation -> {
            RowMapper<PracticeSessionService.ReviewCardData> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("card_id", UUID.class)).thenReturn(UUID.randomUUID());
            when(rs.getObject("source_answer_id", UUID.class)).thenReturn(UUID.randomUUID());
            when(rs.getString("term")).thenReturn("term");
            when(rs.getString("meaning_vi")).thenReturn("nghĩa");
            when(rs.getString("note")).thenReturn("");
            when(rs.getString("source_context")).thenReturn("");
            when(rs.getDouble("ease_factor")).thenReturn(2.5d);
            when(rs.getInt("interval_days")).thenReturn(1);
            when(rs.getInt("repetition")).thenReturn(0);
            when(rs.getTimestamp("due_at")).thenReturn(Timestamp.from(Instant.now()));
            when(rs.getTimestamp("last_reviewed_at")).thenReturn(null);
            when(rs.getInt("review_count")).thenReturn(0);
            when(rs.getInt("lapse_count")).thenReturn(0);
            when(rs.getString("state")).thenReturn("NEW");
            return List.of(mapper.mapRow(rs, 0));
        });

        List<PracticeSessionService.ReviewCardData> cards = service.getReviewSession("user@test.com", 10);

        assertEquals(1, cards.size());
        assertEquals("term", cards.get(0).term());
    }
}

