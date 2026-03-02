package vn.homecredit.englishcoach.backend.practice.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import vn.homecredit.englishcoach.backend.ai.adapter.OpenAiEvaluationClient;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PracticeSessionService {

    private static final Logger log = LoggerFactory.getLogger(PracticeSessionService.class);
    private static final int PROMPT_DIVERSITY_HISTORY_SIZE = 30;
    private static final int PROMPT_CORE_KEYWORDS_WINDOW = 10;
    private static final int PROMPT_REGENERATE_MAX_ATTEMPTS = 5;
    private static final double PROMPT_SIMILARITY_MAX_SCORE = 0.72d;

    private final OpenAiEvaluationClient openAiEvaluationClient;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final Map<String, Deque<List<String>>> topicKeywordHistory;

    public PracticeSessionService(OpenAiEvaluationClient openAiEvaluationClient, JdbcTemplate jdbcTemplate) {
        this.openAiEvaluationClient = openAiEvaluationClient;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = new ObjectMapper();
        this.topicKeywordHistory = new ConcurrentHashMap<>();
    }

    public PracticePromptData createInstantPrompt(String topic, String level) {
        String safeLevel = normalizeLevel(level);
        String safeTopic = normalizeTopic(topic);
        List<String> recentPrompts = getRecentPromptsByTopic(safeTopic, PROMPT_DIVERSITY_HISTORY_SIZE);
        List<String> excludedWords = getRecentCoreKeywords(safeTopic);
        List<String> rejectedPrompts = new ArrayList<>();

        OpenAiEvaluationClient.GeneratedPrompt generated = null;
        for (int attempt = 0; attempt < PROMPT_REGENERATE_MAX_ATTEMPTS; attempt++) {
            OpenAiEvaluationClient.GeneratedPrompt candidate = openAiEvaluationClient.generatePrompt(
                    new OpenAiEvaluationClient.GeneratePromptRequest(
                            safeTopic,
                            "English",
                            safeLevel,
                            recentPrompts,
                            rejectedPrompts,
                            excludedWords
                    )
            );

            if (!isTooSimilarToRecent(candidate.promptText(), recentPrompts, rejectedPrompts)
                    && !hasCoreKeywordOverlap(candidate.coreKeywords(), excludedWords)) {
                generated = candidate;
                break;
            }

            rejectedPrompts.add(candidate.promptText());
        }

        if (generated == null) {
            generated = openAiEvaluationClient.generatePrompt(
                    new OpenAiEvaluationClient.GeneratePromptRequest(
                            safeTopic,
                            "English",
                            safeLevel,
                            recentPrompts,
                            rejectedPrompts,
                            excludedWords
                    )
            );
        }

        rememberCoreKeywords(safeTopic, generated.coreKeywords());

        return new PracticePromptData(
                UUID.randomUUID(),
                generated.direction(),
                generated.promptText(),
                generated.referenceAnswer(),
                generated.hint(),
                Instant.now(),
                safeTopic,
                safeLevel
        );
    }

    private List<String> getRecentPromptsByTopic(String topic, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 60));
        return jdbcTemplate.query(
                """
                SELECT source_sentence
                FROM practice_history
                ORDER BY submitted_at DESC
                LIMIT ?
                """,
                (rs, rowNum) -> rs.getString("source_sentence"),
                safeLimit
        );
    }

    private List<String> getRecentCoreKeywords(String topic) {
        Deque<List<String>> queue = topicKeywordHistory.get(topic);
        if (queue == null || queue.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> words = new LinkedHashSet<>();
        for (List<String> promptKeywords : queue) {
            if (promptKeywords == null) {
                continue;
            }
            for (String word : promptKeywords) {
                String normalized = String.valueOf(word).trim().toLowerCase();
                if (!normalized.isBlank()) {
                    words.add(normalized);
                }
            }
        }
        return words.stream().toList();
    }

    private boolean isTooSimilarToRecent(String candidate, List<String> recentPrompts, List<String> rejectedPrompts) {
        if (candidate == null || candidate.isBlank()) {
            return true;
        }
        for (String oldPrompt : recentPrompts) {
            if (similarity(candidate, oldPrompt) >= PROMPT_SIMILARITY_MAX_SCORE) {
                return true;
            }
        }
        for (String rejected : rejectedPrompts) {
            if (similarity(candidate, rejected) >= PROMPT_SIMILARITY_MAX_SCORE) {
                return true;
            }
        }
        return false;
    }

    private double similarity(String a, String b) {
        Set<String> left = tokenize(a);
        Set<String> right = tokenize(b);
        if (left.isEmpty() || right.isEmpty()) {
            return 0d;
        }
        Set<String> intersection = new HashSet<>(left);
        intersection.retainAll(right);
        Set<String> union = new HashSet<>(left);
        union.addAll(right);
        return union.isEmpty() ? 0d : (intersection.size() * 1.0d / union.size());
    }

    private boolean hasCoreKeywordOverlap(List<String> candidateKeywords, List<String> excludedWords) {
        if (excludedWords == null || excludedWords.isEmpty()) {
            return false;
        }
        if (candidateKeywords == null || candidateKeywords.isEmpty()) {
            return false;
        }
        Set<String> tokens = new HashSet<>();
        for (String keyword : candidateKeywords) {
            String normalized = String.valueOf(keyword).trim().toLowerCase();
            if (!normalized.isBlank()) {
                tokens.add(normalized);
            }
        }
        for (String excluded : excludedWords) {
            if (tokens.contains(excluded)) {
                return true;
            }
        }
        return false;
    }

    private void rememberCoreKeywords(String topic, List<String> coreKeywords) {
        if (coreKeywords == null || coreKeywords.isEmpty()) {
            return;
        }
        List<String> normalized = coreKeywords.stream()
                .map(v -> String.valueOf(v).trim().toLowerCase())
                .filter(v -> !v.isBlank())
                .toList();
        if (normalized.isEmpty()) {
            return;
        }
        Deque<List<String>> queue = topicKeywordHistory.computeIfAbsent(topic, key -> new ArrayDeque<>());
        synchronized (queue) {
            queue.addFirst(normalized);
            while (queue.size() > PROMPT_CORE_KEYWORDS_WINDOW) {
                queue.removeLast();
            }
        }
    }

    private Set<String> tokenize(String text) {
        if (text == null || text.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(text.toLowerCase().split("[^\\p{L}\\p{Nd}]+"))
                .map(String::trim)
                .filter(s -> s.length() > 2)
                .collect(HashSet::new, HashSet::add, HashSet::addAll);
    }

    private String normalizeTopic(String topic) {
        if (topic == null || topic.isBlank()) {
            return "work";
        }
        return topic.trim().toLowerCase();
    }

    public PracticeSubmissionData submitAndEvaluate(String userEmail,
                                                    UUID promptId,
                                                    String sourceSentence,
                                                    String userAnswer,
                                                    String referenceAnswer) {
        OpenAiEvaluationClient.EvaluationResult evaluated = openAiEvaluationClient.evaluate(
                new OpenAiEvaluationClient.EvaluationRequest(sourceSentence, userAnswer, referenceAnswer, "English")
        );

        PracticeSubmissionData submitted = new PracticeSubmissionData(
                UUID.randomUUID(),
                promptId,
                evaluated.overallScore(),
                evaluated.grammarScore(),
                evaluated.naturalnessScore(),
                evaluated.vocabularyScore(),
                evaluated.explanation(),
                evaluated.betterPhrasing(),
                evaluated.vocabularyHints(),
                false,
                "COMPLETED"
        );

        String vocabularyHintsJson = writeVocabularyHintsJson(submitted.vocabularyHints());
        Instant submittedAt = Instant.now();
        Timestamp submittedAtTimestamp = Timestamp.from(submittedAt);
        log.info("practice.submit.insert.start answerId={} userEmail={} submittedAtClass={} submittedAtValue={}",
                submitted.answerId(), userEmail, submittedAtTimestamp.getClass().getName(), submittedAtTimestamp);
        jdbcTemplate.update(
                """
                INSERT INTO practice_history (
                  answer_id, user_email, prompt_id, source_sentence, reference_answer, user_answer,
                  overall_score, grammar_score, naturalness_score, vocabulary_score,
                  explanation, better_phrasing, vocabulary_hints_json, evaluation_status, highlighted, submitted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                submitted.answerId(), userEmail, submitted.promptId(), sourceSentence, referenceAnswer, userAnswer,
                submitted.overallScore(), submitted.grammarScore(), submitted.naturalnessScore(), submitted.vocabularyScore(),
                submitted.explanation(), submitted.betterPhrasing(), vocabularyHintsJson, submitted.evaluationStatus(), false, submittedAtTimestamp
        );
        log.info("practice.submit.insert.success answerId={} userEmail={}", submitted.answerId(), userEmail);

        return submitted;
    }

    public List<PracticeHistoryItemData> getRecentHistory(String userEmail, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 100));
        return jdbcTemplate.query(
                """
                SELECT answer_id, prompt_id, source_sentence, reference_answer, user_answer,
                       overall_score, grammar_score, naturalness_score, vocabulary_score,
                       explanation, better_phrasing, vocabulary_hints_json, evaluation_status,
                       highlighted, submitted_at
                FROM practice_history
                WHERE user_email = ?
                ORDER BY submitted_at DESC
                LIMIT ?
                """,
                (rs, rowNum) -> new PracticeHistoryItemData(
                        rs.getObject("answer_id", UUID.class),
                        rs.getObject("prompt_id", UUID.class),
                        rs.getString("source_sentence"),
                        rs.getString("reference_answer"),
                        rs.getString("user_answer"),
                        rs.getInt("overall_score"),
                        rs.getInt("grammar_score"),
                        rs.getInt("naturalness_score"),
                        rs.getInt("vocabulary_score"),
                        rs.getString("explanation"),
                        rs.getString("better_phrasing"),
                        readVocabularyHintsJson(rs.getString("vocabulary_hints_json")),
                        rs.getBoolean("highlighted"),
                        rs.getString("evaluation_status"),
                        rs.getTimestamp("submitted_at").toInstant()
                ),
                userEmail, safeLimit
        );
    }

    public boolean setHistoryHighlight(String userEmail, UUID answerId, boolean highlighted) {
        int changed = jdbcTemplate.update(
                "UPDATE practice_history SET highlighted = ? WHERE user_email = ? AND answer_id = ?",
                highlighted, userEmail, answerId
        );
        return changed > 0;
    }

    public int deleteHistory(String userEmail, List<UUID> answerIds) {
        if (answerIds == null || answerIds.isEmpty()) {
            return 0;
        }
        int deleted = 0;
        for (UUID answerId : answerIds) {
            deleted += jdbcTemplate.update(
                    "DELETE FROM practice_history WHERE user_email = ? AND answer_id = ?",
                    userEmail,
                    answerId
            );
            jdbcTemplate.update(
                    "DELETE FROM manual_vocabulary WHERE user_email = ? AND source_answer_id = ?",
                    userEmail,
                    answerId
            );
        }
        return deleted;
    }

    public AppConfigData getUserConfig(String userEmail) {
        List<AppConfigData> rows = jdbcTemplate.query(
                """
                SELECT backend_base_url, periodic_enabled, periodic_interval_seconds, answer_mode, practice_topic, practice_level
                FROM user_setting
                WHERE user_email = ?
                """,
                (rs, rowNum) -> new AppConfigData(
                        rs.getString("backend_base_url"),
                        rs.getBoolean("periodic_enabled"),
                        rs.getInt("periodic_interval_seconds"),
                        rs.getString("answer_mode"),
                        rs.getString("practice_topic"),
                        rs.getString("practice_level")
                ),
                userEmail
        );
        if (!rows.isEmpty()) {
            return rows.get(0);
        }
        return new AppConfigData("http://localhost:8088", true, 45, "MULTIPLE_CHOICE", "work", "medium");
    }

    public AppConfigData upsertUserConfig(String userEmail, AppConfigData config) {
        String safeLevel = normalizeLevel(config.practiceLevel());
        jdbcTemplate.update(
                """
                INSERT INTO user_setting (user_email, backend_base_url, periodic_enabled, periodic_interval_seconds, answer_mode, practice_topic, practice_level, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
                ON CONFLICT (user_email)
                DO UPDATE SET
                  backend_base_url = EXCLUDED.backend_base_url,
                  periodic_enabled = EXCLUDED.periodic_enabled,
                  periodic_interval_seconds = EXCLUDED.periodic_interval_seconds,
                  answer_mode = EXCLUDED.answer_mode,
                  practice_topic = EXCLUDED.practice_topic,
                  practice_level = EXCLUDED.practice_level,
                  updated_at = NOW()
                """,
                userEmail,
                config.backendBaseUrl(),
                config.periodicEnabled(),
                config.periodicIntervalSeconds(),
                config.answerMode(),
                config.practiceTopic(),
                safeLevel
        );
        return new AppConfigData(
                config.backendBaseUrl(),
                config.periodicEnabled(),
                config.periodicIntervalSeconds(),
                config.answerMode(),
                config.practiceTopic(),
                safeLevel
        );
    }

    public List<ManualVocabularyData> getManualVocabulary(String userEmail, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 500));
        return jdbcTemplate.query(
                """
                SELECT source_answer_id, term, meaning_vi, note, source_context, selected_at
                FROM manual_vocabulary
                WHERE user_email = ?
                ORDER BY selected_at DESC
                LIMIT ?
                """,
                (rs, rowNum) -> new ManualVocabularyData(
                        rs.getObject("source_answer_id", UUID.class),
                        rs.getString("term"),
                        rs.getString("meaning_vi"),
                        rs.getString("note"),
                        rs.getString("source_context"),
                        rs.getTimestamp("selected_at").toInstant()
                ),
                userEmail, safeLimit
        );
    }

    public ManualVocabularyData addManualVocabulary(String userEmail, ManualVocabularyCreateData request) {
        jdbcTemplate.update(
                """
                INSERT INTO manual_vocabulary (user_email, source_answer_id, term, meaning_vi, note, source_context, selected_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())
                ON CONFLICT (user_email, source_answer_id, term)
                DO UPDATE SET
                  meaning_vi = EXCLUDED.meaning_vi,
                  note = EXCLUDED.note,
                  source_context = EXCLUDED.source_context,
                  selected_at = NOW()
                """,
                userEmail,
                request.sourceAnswerId(),
                request.term(),
                request.meaningVi(),
                request.note(),
                request.sourceContext()
        );
        syncManualVocabularyToSrsCards(userEmail);
        return new ManualVocabularyData(
                request.sourceAnswerId(),
                request.term(),
                request.meaningVi(),
                request.note(),
                request.sourceContext(),
                Instant.now()
        );
    }

    public boolean removeManualVocabulary(String userEmail, UUID sourceAnswerId, String term) {
        int changed = jdbcTemplate.update(
                "DELETE FROM manual_vocabulary WHERE user_email = ? AND source_answer_id = ? AND term = ?",
                userEmail,
                sourceAnswerId,
                term
        );
        jdbcTemplate.update(
                "DELETE FROM srs_card WHERE user_email = ? AND term = ?",
                userEmail,
                term
        );
        return changed > 0;
    }

    public int deleteManualVocabularyByKeys(String userEmail, List<ManualVocabularyDeleteKey> keys) {
        if (keys == null || keys.isEmpty()) {
            return 0;
        }
        int deleted = 0;
        for (ManualVocabularyDeleteKey key : keys) {
            deleted += jdbcTemplate.update(
                    "DELETE FROM manual_vocabulary WHERE user_email = ? AND source_answer_id = ? AND term = ?",
                    userEmail,
                    key.sourceAnswerId(),
                    key.term()
            );
            jdbcTemplate.update(
                    "DELETE FROM srs_card WHERE user_email = ? AND term = ?",
                    userEmail,
                    key.term()
            );
        }
        return deleted;
    }

    public ReviewSummaryData getReviewSummary(String userEmail) {
        syncManualVocabularyToSrsCards(userEmail);
        Instant now = Instant.now();

        Integer dueCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM srs_card WHERE user_email = ? AND due_at <= NOW()",
                Integer.class,
                userEmail
        );
        Integer overdueCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM srs_card WHERE user_email = ? AND due_at < NOW() - INTERVAL '1 day'",
                Integer.class,
                userEmail
        );
        Integer newCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM srs_card WHERE user_email = ? AND state = 'NEW'",
                Integer.class,
                userEmail
        );
        Integer todayReviewed = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM srs_review_log WHERE user_email = ? AND reviewed_at >= CURRENT_DATE",
                Integer.class,
                userEmail
        );

        RetentionData retention = jdbcTemplate.queryForObject(
                """
                SELECT
                  COUNT(*) AS total_count,
                  SUM(CASE WHEN quality >= 4 THEN 1 ELSE 0 END) AS success_count
                FROM srs_review_log
                WHERE user_email = ?
                  AND reviewed_at >= NOW() - INTERVAL '30 day'
                """,
                (rs, rowNum) -> new RetentionData(
                        rs.getInt("total_count"),
                        rs.getInt("success_count")
                ),
                userEmail
        );

        int streakDays = computeReviewStreakDays(userEmail);
        double retentionRate30d = 0d;
        if (retention != null && retention.totalCount() > 0) {
            retentionRate30d = (retention.successCount() * 100.0d) / retention.totalCount();
        }

        return new ReviewSummaryData(
                dueCount == null ? 0 : dueCount,
                overdueCount == null ? 0 : overdueCount,
                newCount == null ? 0 : newCount,
                todayReviewed == null ? 0 : todayReviewed,
                Math.round(retentionRate30d * 10.0d) / 10.0d,
                streakDays,
                now
        );
    }

    public List<ReviewCardData> getReviewSession(String userEmail, int limit) {
        syncManualVocabularyToSrsCards(userEmail);
        int safeLimit = Math.max(1, Math.min(limit, 50));
        return jdbcTemplate.query(
                """
                SELECT card_id, source_answer_id, term, meaning_vi, note, source_context,
                       ease_factor, interval_days, repetition, due_at, last_reviewed_at,
                       review_count, lapse_count, state
                FROM srs_card
                WHERE user_email = ?
                  AND due_at <= NOW()
                ORDER BY
                  CASE WHEN due_at < NOW() - INTERVAL '1 day' THEN 0 ELSE 1 END,
                  due_at ASC
                LIMIT ?
                """,
                (rs, rowNum) -> new ReviewCardData(
                        rs.getObject("card_id", UUID.class),
                        rs.getObject("source_answer_id", UUID.class),
                        rs.getString("term"),
                        rs.getString("meaning_vi"),
                        rs.getString("note"),
                        rs.getString("source_context"),
                        rs.getDouble("ease_factor"),
                        rs.getInt("interval_days"),
                        rs.getInt("repetition"),
                        rs.getTimestamp("due_at").toInstant(),
                        rs.getTimestamp("last_reviewed_at") == null ? null : rs.getTimestamp("last_reviewed_at").toInstant(),
                        rs.getInt("review_count"),
                        rs.getInt("lapse_count"),
                        rs.getString("state")
                ),
                userEmail,
                safeLimit
        );
    }

    public ReviewGradeData gradeReviewCard(String userEmail, UUID cardId, int quality) {
        int safeQuality = Math.max(0, Math.min(5, quality));

        List<ReviewCardData> rows = jdbcTemplate.query(
                """
                SELECT card_id, source_answer_id, term, meaning_vi, note, source_context,
                       ease_factor, interval_days, repetition, due_at, last_reviewed_at,
                       review_count, lapse_count, state
                FROM srs_card
                WHERE user_email = ? AND card_id = ?
                """,
                (rs, rowNum) -> new ReviewCardData(
                        rs.getObject("card_id", UUID.class),
                        rs.getObject("source_answer_id", UUID.class),
                        rs.getString("term"),
                        rs.getString("meaning_vi"),
                        rs.getString("note"),
                        rs.getString("source_context"),
                        rs.getDouble("ease_factor"),
                        rs.getInt("interval_days"),
                        rs.getInt("repetition"),
                        rs.getTimestamp("due_at").toInstant(),
                        rs.getTimestamp("last_reviewed_at") == null ? null : rs.getTimestamp("last_reviewed_at").toInstant(),
                        rs.getInt("review_count"),
                        rs.getInt("lapse_count"),
                        rs.getString("state")
                ),
                userEmail,
                cardId
        );
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Review card not found");
        }

        ReviewCardData current = rows.get(0);
        Instant now = Instant.now();

        double prevEase = current.easeFactor();
        int prevInterval = Math.max(0, current.intervalDays());
        int prevRepetition = Math.max(0, current.repetition());
        String prevState = current.state();

        double nextEase = Math.max(1.3d, prevEase + (0.1d - (5 - safeQuality) * (0.08d + (5 - safeQuality) * 0.02d)));
        int nextInterval;
        int nextRepetition;
        int nextLapse = current.lapseCount();
        String nextState;

        if (safeQuality < 3) {
            nextRepetition = 0;
            nextInterval = 1;
            nextLapse = current.lapseCount() + 1;
            nextState = "LEARNING";
            nextEase = Math.max(1.3d, prevEase - 0.2d);
        } else {
            nextRepetition = prevRepetition + 1;
            if (prevRepetition <= 0) {
                nextInterval = 1;
            } else if (prevRepetition == 1) {
                nextInterval = 3;
            } else {
                nextInterval = (int) Math.max(1, Math.round(prevInterval * nextEase));
            }
            nextState = "REVIEW";
        }

        Instant nextDueAt = now.plusSeconds(nextInterval * 86_400L);

        jdbcTemplate.update(
                """
                UPDATE srs_card
                SET ease_factor = ?,
                    interval_days = ?,
                    repetition = ?,
                    due_at = ?,
                    last_reviewed_at = ?,
                    review_count = review_count + 1,
                    lapse_count = ?,
                    state = ?,
                    updated_at = NOW()
                WHERE user_email = ? AND card_id = ?
                """,
                nextEase,
                nextInterval,
                nextRepetition,
                Timestamp.from(nextDueAt),
                Timestamp.from(now),
                nextLapse,
                nextState,
                userEmail,
                cardId
        );

        jdbcTemplate.update(
                """
                INSERT INTO srs_review_log (
                  user_email, card_id, quality, prev_due_at, next_due_at, reviewed_at,
                  prev_state, next_state, prev_interval_days, next_interval_days,
                  prev_ease_factor, next_ease_factor
                ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)
                """,
                userEmail,
                cardId,
                safeQuality,
                Timestamp.from(current.dueAt()),
                Timestamp.from(nextDueAt),
                prevState,
                nextState,
                prevInterval,
                nextInterval,
                prevEase,
                nextEase
        );

        return new ReviewGradeData(
                safeQuality,
                nextDueAt,
                new ReviewCardData(
                        current.cardId(),
                        current.sourceAnswerId(),
                        current.term(),
                        current.meaningVi(),
                        current.note(),
                        current.sourceContext(),
                        Math.round(nextEase * 100.0d) / 100.0d,
                        nextInterval,
                        nextRepetition,
                        nextDueAt,
                        now,
                        current.reviewCount() + 1,
                        nextLapse,
                        nextState
                )
        );
    }

    private void syncManualVocabularyToSrsCards(String userEmail) {
        jdbcTemplate.update(
                """
                INSERT INTO srs_card (
                  user_email, source_answer_id, term, meaning_vi, note, source_context,
                  due_at, state, created_at, updated_at
                )
                SELECT mv.user_email,
                       mv.source_answer_id,
                       mv.term,
                       mv.meaning_vi,
                       COALESCE(mv.note, ''),
                       COALESCE(mv.source_context, ''),
                       NOW(),
                       'NEW',
                       NOW(),
                       NOW()
                FROM manual_vocabulary mv
                WHERE mv.user_email = ?
                ON CONFLICT (user_email, term)
                DO UPDATE SET
                  source_answer_id = EXCLUDED.source_answer_id,
                  meaning_vi = EXCLUDED.meaning_vi,
                  note = EXCLUDED.note,
                  source_context = EXCLUDED.source_context,
                  updated_at = NOW()
                """,
                userEmail
        );
    }

    private int computeReviewStreakDays(String userEmail) {
        List<LocalDate> dates = jdbcTemplate.query(
                """
                SELECT DISTINCT DATE(reviewed_at) AS reviewed_date
                FROM srs_review_log
                WHERE user_email = ?
                ORDER BY reviewed_date DESC
                """,
                (rs, rowNum) -> rs.getDate("reviewed_date").toLocalDate(),
                userEmail
        );
        if (dates.isEmpty()) {
            return 0;
        }
        Set<LocalDate> daySet = new HashSet<>(dates);
        LocalDate cursor = LocalDate.now(ZoneId.systemDefault());
        if (!daySet.contains(cursor) && daySet.contains(cursor.minusDays(1))) {
            cursor = cursor.minusDays(1);
        }
        int streak = 0;
        while (daySet.contains(cursor)) {
            streak++;
            cursor = cursor.minusDays(1);
        }
        return streak;
    }

    private String writeVocabularyHintsJson(List<OpenAiEvaluationClient.VocabularyHint> hints) {
        try {
            return objectMapper.writeValueAsString(hints == null ? List.of() : hints);
        } catch (Exception ex) {
            return "[]";
        }
    }

    private List<OpenAiEvaluationClient.VocabularyHint> readVocabularyHintsJson(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<Map<String, Object>> rows = objectMapper.readValue(json, new TypeReference<>() {});
            return rows.stream()
                    .map(row -> new OpenAiEvaluationClient.VocabularyHint(
                            String.valueOf(row.getOrDefault("term", "")).trim(),
                            String.valueOf(row.getOrDefault("meaningVi", "")).trim(),
                            String.valueOf(row.getOrDefault("note", "")).trim()
                    ))
                    .filter(h -> !h.term().isBlank())
                    .toList();
        } catch (Exception ex) {
            return Collections.emptyList();
        }
    }

    public record PracticePromptData(UUID promptId,
                                     String direction,
                                     String promptText,
                                     String referenceAnswer,
                                     OpenAiEvaluationClient.PromptHint hint,
                                     Instant issuedAt,
                                     String topic,
                                     String level) {
    }

    public record PracticeSubmissionData(UUID answerId,
                                         UUID promptId,
                                         int overallScore,
                                         int grammarScore,
                                         int naturalnessScore,
                                         int vocabularyScore,
                                         String explanation,
                                         String betterPhrasing,
                                         List<OpenAiEvaluationClient.VocabularyHint> vocabularyHints,
                                         boolean highlighted,
                                         String evaluationStatus) {
    }

    public record PracticeHistoryItemData(UUID answerId,
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

    public record AppConfigData(String backendBaseUrl,
                                boolean periodicEnabled,
                                int periodicIntervalSeconds,
                                String answerMode,
                                String practiceTopic,
                                String practiceLevel) {
    }

    public record ManualVocabularyData(UUID sourceAnswerId,
                                       String term,
                                       String meaningVi,
                                       String note,
                                       String sourceContext,
                                       Instant selectedAt) {
    }

    public record ManualVocabularyCreateData(UUID sourceAnswerId,
                                             String term,
                                             String meaningVi,
                                             String note,
                                             String sourceContext) {
    }

    public record ManualVocabularyDeleteKey(UUID sourceAnswerId, String term) {
    }

    public record ReviewSummaryData(int dueCount,
                                    int overdueCount,
                                    int newCount,
                                    int todayReviewedCount,
                                    double retentionRate30d,
                                    int streakDays,
                                    Instant generatedAt) {
    }

    public record ReviewCardData(UUID cardId,
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

    public record ReviewGradeData(int quality, Instant nextDueAt, ReviewCardData card) {
    }

    private record RetentionData(int totalCount, int successCount) {
    }

    private String normalizeLevel(String level) {
        if (level == null || level.isBlank()) {
            return "medium";
        }
        String normalized = level.trim().toLowerCase();
        return switch (normalized) {
            case "easy", "medium", "hard" -> normalized;
            default -> "medium";
        };
    }
}
