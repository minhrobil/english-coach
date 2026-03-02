package vn.homecredit.englishcoach.backend.ai.adapter;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import vn.homecredit.englishcoach.backend.core.config.AppProperties;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

@Component
public class OpenAiEvaluationClientImpl implements OpenAiEvaluationClient {

    private static final Logger log = LoggerFactory.getLogger(OpenAiEvaluationClientImpl.class);
    private static final String DEFAULT_AI_URL = "https://api.openai.com/v1/responses";
    private static final List<String> EVALUATION_MODEL_CANDIDATES = List.of("gpt-4.1", "gpt-4.1-mini");
    private static final Set<String> BASIC_STOPWORDS = Set.of(
            "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "had", "has", "have",
            "he", "her", "his", "i", "in", "is", "it", "its", "me", "my", "of", "on", "or", "our",
            "she", "that", "the", "their", "them", "there", "they", "this", "to", "was", "we", "were",
            "will", "with", "you", "your", "yours", "do", "does", "did", "done", "can", "could", "should",
            "would", "please", "one", "more", "time"
    );
    private static final List<GeneratedPrompt> FALLBACK_PROMPTS = List.of(
            new GeneratedPrompt(
                    "vi_to_en",
                    "Dịch sang tiếng Anh: 'Chúng ta có thể dời cuộc họp sang sáng mai không?'",
                    "Could we move the meeting to tomorrow morning?",
                    new OpenAiEvaluationClient.PromptHint(
                            "Polite request with modal",
                            "Could + subject + base verb + ...?",
                            List.of("could", "move the meeting", "tomorrow morning", "reschedule"),
                            "Dùng 'Could' để đề nghị lịch sự; động từ để nguyên mẫu sau modal."
                    ),
                    List.of("meeting", "reschedule", "tomorrow morning")
            ),
            new GeneratedPrompt(
                    "vi_to_en",
                    "Dịch sang tiếng Anh: 'Bạn có thể gửi cho tôi báo cáo trước 3 giờ chiều nay không?'",
                    "Could you send me the report before 3 PM today?",
                    new OpenAiEvaluationClient.PromptHint(
                            "Polite request + deadline preposition",
                            "Could you + base verb + object + before + time?",
                            List.of("could you", "send", "report", "before 3 PM", "today"),
                            "Cụm thời gian hạn chót thường dùng 'before + mốc giờ'."
                    ),
                    List.of("report", "deadline", "send")
            ),
            new GeneratedPrompt(
                    "vi_to_en",
                    "Dịch sang tiếng Anh: 'Tôi sẽ xác nhận lại lịch hẹn sau bữa trưa.'",
                    "I will confirm the appointment schedule after lunch.",
                    new OpenAiEvaluationClient.PromptHint(
                            "Future plan statement",
                            "Subject + will + base verb + object + after + time marker.",
                            List.of("will", "confirm", "appointment schedule", "after lunch"),
                            "Dùng 'will' để nêu hành động dự định thực hiện trong tương lai gần."
                    ),
                    List.of("appointment", "confirm", "after lunch")
            ),
            new GeneratedPrompt(
                    "vi_to_en",
                    "Dịch sang tiếng Anh: 'Hãy cho tôi thêm một ngày để hoàn tất phần còn lại.'",
                    "Please give me one more day to complete the remaining part.",
                    new OpenAiEvaluationClient.PromptHint(
                            "Requesting extension",
                            "Please + verb + object + time extension + to + base verb.",
                            List.of("please", "one more day", "complete", "remaining part"),
                            "Mẫu 'one more day to + V' diễn đạt xin thêm thời gian hoàn thành."
                    ),
                    List.of("extension", "one more day", "complete")
            )
    );

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public OpenAiEvaluationClientImpl(AppProperties appProperties) {
        this.appProperties = appProperties;
        this.objectMapper = new ObjectMapper();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(appProperties.openai().timeoutMillis()))
                .build();
    }

    @Override
    public GeneratedPrompt generatePrompt(GeneratePromptRequest request) {
        log.info("openai.generatePrompt.start model={} timeoutMs={}", appProperties.openai().model(), appProperties.openai().timeoutMillis());

        if (appProperties.openai().apiKey() == null || appProperties.openai().apiKey().isBlank()) {
            return new GeneratedPrompt(
                    "vi_to_en",
                    "Hãy dịch sang tiếng Anh: 'Tôi sẽ gửi bạn bản cập nhật trước 4 giờ chiều hôm nay.'",
                    "I will send you the update before 4 PM today.",
                    new OpenAiEvaluationClient.PromptHint(
                            "Future commitment + deadline",
                            "Subject + will + base verb + object + before + time.",
                            List.of("will", "send", "update", "before 4 PM"),
                            "Chú ý cấu trúc cam kết hành động và cụm hạn chót 'before + time'."
                    ),
                    List.of("update", "deadline", "send")
            );
        }

        String normalizedLevel = normalizeLevel(request.level());

        String instruction = "Bạn là trợ lý tạo câu hỏi luyện dịch Việt-Anh. " +
                "Trả về JSON hợp lệ duy nhất theo schema: " +
                "{\"direction\":\"vi_to_en|en_to_vi\",\"promptText\":\"string\",\"referenceAnswer\":\"string\",\"hint\":{" +
                "\"grammarPattern\":\"string\",\"formula\":\"string\",\"keyVocabulary\":[\"string\",...],\"usageNote\":\"string\"}," +
                "\"coreKeywords\":[\"string\",...]} . " +
                "Mỗi lần tạo phải đa dạng bối cảnh và hành động, tránh lặp ý. " +
                "Bắt buộc mở rộng phạm vi nội dung theo taxonomy đa dạng: planning, operations, customer service, healthcare, finance, legal compliance, procurement, logistics, training, incident response, digital transformation. " +
                "Nếu topic=healthcare thì phải luân phiên nhiều nhóm ý: infection control, patient safety, triage, staffing, equipment procurement, insurance/billing, telemedicine, emergency readiness, staff training, patient communication; không được xoay quanh 1 motif duy nhất. " +
                "`coreKeywords` bắt buộc 3-6 từ/cụm từ cốt lõi đại diện ý chính của câu, dùng để chống lặp ở các câu sau. " +
                "`hint` phải cụ thể, không chung chung: grammarPattern nêu loại cấu trúc, formula nêu công thức câu, " +
                "keyVocabulary gồm 3-5 từ/cụm từ trọng tâm để dùng đúng ngữ cảnh, usageNote giải thích ngắn cách dùng. " +
                "Không được trả các câu mơ hồ kiểu 'dùng từ vựng liên quan ...'. " +
                "Không thêm markdown, không thêm giải thích.";

        String userPrompt = "Topic=" + request.topic() + ", level=" + normalizedLevel + ", targetLanguage=" + request.targetLanguage() +
                ". Hãy tạo 1 câu hỏi thực tế cho bối cảnh công việc/đời sống. " +
                buildDifficultyRule(normalizedLevel) +
                " Không tạo câu quá giống với các mẫu cũ. " +
                "Các prompt gần đây cần tránh trùng ý: " + String.join(" | ", request.recentPrompts() == null ? List.of() : request.recentPrompts()) + ". " +
                "Các prompt vừa bị từ chối do trùng ý: " + String.join(" | ", request.rejectedPrompts() == null ? List.of() : request.rejectedPrompts()) + ". " +
                "Danh sách coreKeywords đã dùng gần đây cần tránh lặp lại trong câu mới: " + String.join(", ", request.excludedWords() == null ? List.of() : request.excludedWords()) + ".";

        try {
            JsonNode root = callOpenAi(instruction, userPrompt);
            logUsage(root, "generatePrompt");

            String outputText = extractOutputText(root);
            JsonNode parsed = objectMapper.readTree(normalizeJsonOutput(outputText));

            return new GeneratedPrompt(
                    parsed.path("direction").asText("vi_to_en"),
                    parsed.path("promptText").asText("Dịch sang tiếng Anh: 'Bạn có thể gửi giúp tôi tài liệu này không?'"),
                    parsed.path("referenceAnswer").asText("Could you help send me this document?"),
                    parsePromptHint(parsed.path("hint")),
                    parseCoreKeywords(parsed.path("coreKeywords"))
            );
        } catch (Exception ex) {
            log.error("openai.generatePrompt.error, fallback to random template", ex);
            return randomFallbackPrompt();
        }
    }

    @Override
    public EvaluationResult evaluate(EvaluationRequest request) {
        log.info("openai.evaluate.start model={} timeoutMs={}", appProperties.openai().model(), appProperties.openai().timeoutMillis());

        if (appProperties.openai().apiKey() == null || appProperties.openai().apiKey().isBlank()) {
            return new EvaluationResult(
                    70,
                    72,
                    68,
                    70,
                    "Scaffold mode: chưa cấu hình OPENAI_API_KEY nên dùng fallback evaluator.",
                    request.referenceAnswer(),
                    buildFallbackVocabularyHints(request.sourceSentence(), request.referenceAnswer())
            );
        }

        String instruction = "Bạn là giám khảo tiếng Anh. Chấm điểm câu trả lời và trả về JSON hợp lệ duy nhất theo schema: " +
                "{\"grammarScore\":0-100,\"naturalnessScore\":0-100,\"vocabularyScore\":0-100,\"overallScore\":0-100," +
                "\"explanation\":\"string\",\"betterPhrasing\":\"string\",\"vocabularyHints\":[{" +
                "\"term\":\"string\",\"meaningVi\":\"string\",\"note\":\"string\"},...]}. " +
                "Áp dụng rubric nghiêm ngặt: chỉ chấm naturalness >= 90 khi câu trả lời nghe như native speaker trong ngữ cảnh thực tế; " +
                "dịch word-by-word, collocation không tự nhiên, hoặc ngữ điệu máy móc phải kéo naturalness xuống rõ rệt. " +
                "`overallScore` phải phản ánh mạnh chất lượng native-like, không chỉ đúng ngữ pháp. " +
                "`betterPhrasing` phải tự nhiên, sát ngữ cảnh công việc. " +
                "`vocabularyHints` chỉ chứa từ/cụm từ mới có giá trị học, lấy từ sourceSentence và betterPhrasing, từ 4-8 mục, " +
                "mỗi mục phải có nghĩa tiếng Việt ngắn gọn và ghi chú khi dùng trong ngữ cảnh thực tế. " +
                "Không markdown, không giải thích ngoài JSON.";

        String userPrompt = "sourceSentence=" + request.sourceSentence() +
                "\nreferenceAnswer=" + request.referenceAnswer() +
                "\nuserAnswer=" + request.userAnswer() +
                "\ntargetLanguage=" + request.targetLanguage();

        List<String> modelCandidates = new ArrayList<>();
        modelCandidates.add(appProperties.openai().model());
        for (String candidate : EVALUATION_MODEL_CANDIDATES) {
            if (!modelCandidates.contains(candidate)) {
                modelCandidates.add(candidate);
            }
        }

        Exception lastException = null;
        for (String model : modelCandidates) {
            try {
                JsonNode root = callOpenAi(model, instruction, userPrompt, "evaluate");
                log.info("openai.evaluate.response.shape model={} hasOutputText={} hasOutput={} outputSize={}",
                        model,
                        root.hasNonNull("output_text"),
                        root.has("output"),
                        root.path("output").isArray() ? root.path("output").size() : -1);
                logUsage(root, "evaluate");

                String outputText = extractOutputText(root);
                JsonNode parsed = objectMapper.readTree(normalizeJsonOutput(outputText));
                List<OpenAiEvaluationClient.VocabularyHint> vocabularyHints = parseVocabularyHints(
                        parsed,
                        request.sourceSentence(),
                        parsed.path("betterPhrasing").asText(request.referenceAnswer())
                );

                return new EvaluationResult(
                        parsed.path("grammarScore").asInt(75),
                        parsed.path("naturalnessScore").asInt(75),
                        parsed.path("vocabularyScore").asInt(75),
                        parsed.path("overallScore").asInt(75),
                        parsed.path("explanation").asText("Câu trả lời ổn, cần tự nhiên hơn."),
                        parsed.path("betterPhrasing").asText(request.referenceAnswer()),
                        vocabularyHints
                );
            } catch (Exception ex) {
                lastException = ex;
                log.warn("openai.evaluate.model.failed model={}, fallback-next=true", model, ex);
            }
        }

        log.error("openai.evaluate.error, fallback evaluator", lastException);
        return new EvaluationResult(
                80,
                82,
                79,
                80,
                "Fallback evaluator: không gọi được OpenAI hoặc parse lỗi, nên dùng đáp án tham chiếu để đảm bảo đúng ngữ cảnh câu hỏi hiện tại.",
                request.referenceAnswer(),
                buildFallbackVocabularyHints(request.sourceSentence(), request.referenceAnswer())
        );
    }

    private List<OpenAiEvaluationClient.VocabularyHint> parseVocabularyHints(JsonNode parsed, String sourceSentence, String betterPhrasing) {
        List<OpenAiEvaluationClient.VocabularyHint> vocabularyHints = new ArrayList<>();
        JsonNode hintsArray = parsed.path("vocabularyHints");
        if (hintsArray.isArray()) {
            for (JsonNode hintNode : hintsArray) {
                String term = hintNode.path("term").asText("").trim();
                String meaningVi = hintNode.path("meaningVi").asText("").trim();
                String note = hintNode.path("note").asText("").trim();
                if (term.isBlank() || meaningVi.isBlank()) {
                    continue;
                }
                vocabularyHints.add(new OpenAiEvaluationClient.VocabularyHint(term, meaningVi, note));
            }
        }

        if (!vocabularyHints.isEmpty()) {
            return vocabularyHints;
        }

        return buildFallbackVocabularyHints(sourceSentence, betterPhrasing);
    }

    private JsonNode callOpenAi(String instruction, String userPrompt) throws IOException, InterruptedException {
        return callOpenAi(appProperties.openai().model(), instruction, userPrompt, "generatePrompt");
    }

    private JsonNode callOpenAi(String model, String instruction, String userPrompt, String operation) throws IOException, InterruptedException {
        long startedAt = System.nanoTime();
        String apiUrl = resolveAiUrl();
        boolean chatCompletionsMode = apiUrl.contains("/chat/completions");

        Map<String, Object> payload = chatCompletionsMode
                ? Map.of(
                "model", model,
                "messages", new Object[]{
                        Map.of("role", "system", "content", instruction),
                        Map.of("role", "user", "content", userPrompt)
                },
                "temperature", 0.2,
                "max_tokens", appProperties.openai().maxTokens()
        )
                : Map.of(
                "model", model,
                "input", new Object[]{
                        Map.of("role", "system", "content", instruction),
                        Map.of("role", "user", "content", userPrompt)
                },
                "temperature", 0.2,
                "max_output_tokens", appProperties.openai().maxTokens()
        );

        String body = objectMapper.writeValueAsString(payload);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .header("Authorization", "Bearer " + appProperties.openai().apiKey())
                .header("Content-Type", "application/json")
                .timeout(Duration.ofMillis(appProperties.openai().timeoutMillis()))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() > 299) {
            throw new IllegalStateException("OpenAI call failed, status=" + response.statusCode() + ", body=" + response.body());
        }

        long latencyMs = (System.nanoTime() - startedAt) / 1_000_000;
        log.info("openai.{}.latency model={} latencyMs={} endpoint={}", operation, model, latencyMs, apiUrl);

        JsonNode rawRoot = objectMapper.readTree(response.body());
        if (chatCompletionsMode) {
            return normalizeChatCompletionsResponse(rawRoot);
        }

        return rawRoot;
    }

    private String resolveAiUrl() {
        String configured = appProperties.openai().baseUrl();
        if (configured == null || configured.isBlank()) {
            return DEFAULT_AI_URL;
        }
        return configured.trim();
    }

    private JsonNode normalizeChatCompletionsResponse(JsonNode root) {
        ObjectNode normalized = objectMapper.createObjectNode();
        String content = root.path("choices").isArray() && !root.path("choices").isEmpty()
                ? root.path("choices").get(0).path("message").path("content").asText("")
                : "";
        normalized.put("output_text", content);

        JsonNode usage = root.path("usage");
        ObjectNode normalizedUsage = objectMapper.createObjectNode();
        int inputTokens = usage.path("prompt_tokens").asInt(0);
        int outputTokens = usage.path("completion_tokens").asInt(0);
        int totalTokens = usage.path("total_tokens").asInt(inputTokens + outputTokens);
        normalizedUsage.put("input_tokens", inputTokens);
        normalizedUsage.put("output_tokens", outputTokens);
        normalizedUsage.put("total_tokens", totalTokens);
        normalized.set("usage", normalizedUsage);

        return normalized;
    }

    private List<String> extractCandidateVocabulary(String sourceSentence, String betterPhrasing) {
        LinkedHashSet<String> words = new LinkedHashSet<>();
        collectWords(words, sourceSentence);
        collectWords(words, betterPhrasing);
        return words.stream().limit(8).toList();
    }

    private List<OpenAiEvaluationClient.VocabularyHint> buildFallbackVocabularyHints(String sourceSentence, String betterPhrasing) {
        return extractCandidateVocabulary(sourceSentence, betterPhrasing)
                .stream()
                .map(word -> new OpenAiEvaluationClient.VocabularyHint(word, "(chưa có nghĩa từ LLM)", "Từ/cụm từ nên lưu ý trong ngữ cảnh câu này"))
                .toList();
    }

    private void collectWords(Set<String> collector, String text) {
        if (text == null || text.isBlank()) {
            return;
        }
        for (String token : text.toLowerCase().split("\\s+")) {
            String normalized = token
                    .replaceAll("[^a-z']", "")
                    .replaceAll("^'+|'+$", "");
            if (normalized.length() < 3 || BASIC_STOPWORDS.contains(normalized)) {
                continue;
            }
            collector.add(normalized);
        }
    }

    private String extractOutputText(JsonNode root) {
        String direct = root.path("output_text").asText();
        if (direct != null && !direct.isBlank()) {
            return direct;
        }

        JsonNode output = root.path("output");
        if (output.isArray()) {
            for (JsonNode item : output) {
                JsonNode content = item.path("content");
                if (content.isArray()) {
                    for (JsonNode c : content) {
                        if ("output_text".equals(c.path("type").asText())) {
                            String text = c.path("text").asText();
                            if (text != null && !text.isBlank()) {
                                return text;
                            }
                        }
                    }
                }
            }
        }

        log.error("openai.extractOutputText.failed rootKeys={} outputNodeType={} outputPreview={}",
                root.properties().stream().map(Map.Entry::getKey).toList(),
                output.getNodeType(),
                truncate(root.toString(), 1200));

        throw new IllegalStateException("Cannot extract output_text from OpenAI response");
    }

    private String normalizeJsonOutput(String outputText) {
        if (outputText == null) {
            throw new IllegalStateException("OpenAI output text is null");
        }

        String cleaned = outputText.trim();
        if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace("```json", "").replace("```", "").trim();
        }

        int firstBrace = cleaned.indexOf('{');
        int lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        } else {
            log.error("openai.normalizeJsonOutput.noJsonObject outputPreview={}", truncate(cleaned, 1200));
        }

        return cleaned;
    }

    private String truncate(String value, int maxLength) {
        if (value == null) {
            return "null";
        }
        if (value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "...<truncated>";
    }

    private GeneratedPrompt randomFallbackPrompt() {
        int index = ThreadLocalRandom.current().nextInt(FALLBACK_PROMPTS.size());
        return FALLBACK_PROMPTS.get(index);
    }

    private OpenAiEvaluationClient.PromptHint parsePromptHint(JsonNode hintNode) {
        String grammarPattern = hintNode.path("grammarPattern").asText("").trim();
        String formula = hintNode.path("formula").asText("").trim();
        String usageNote = hintNode.path("usageNote").asText("").trim();

        List<String> keyVocabulary = new ArrayList<>();
        JsonNode vocabularyNode = hintNode.path("keyVocabulary");
        if (vocabularyNode.isArray()) {
            for (JsonNode v : vocabularyNode) {
                String value = v.asText("").trim();
                if (!value.isBlank()) {
                    keyVocabulary.add(value);
                }
            }
        }

        if (grammarPattern.isBlank() || formula.isBlank() || keyVocabulary.isEmpty()) {
            return new OpenAiEvaluationClient.PromptHint(
                    "Polite request",
                    "Could/Can + subject + base verb + object?",
                    List.of("could", "can", "deadline", "customer"),
                    "Ưu tiên động từ rõ hành động và từ khóa đúng ngữ cảnh công việc."
            );
        }
        return new OpenAiEvaluationClient.PromptHint(grammarPattern, formula, keyVocabulary.stream().limit(5).toList(), usageNote);
    }

    private List<String> parseCoreKeywords(JsonNode keywordsNode) {
        List<String> coreKeywords = new ArrayList<>();
        if (keywordsNode.isArray()) {
            for (JsonNode node : keywordsNode) {
                String value = node.asText("").trim().toLowerCase();
                if (!value.isBlank() && value.length() >= 3) {
                    coreKeywords.add(value);
                }
            }
        }
        if (coreKeywords.isEmpty()) {
            return List.of("request", "timeline", "coordination");
        }
        return coreKeywords.stream().distinct().limit(6).toList();
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

    private String buildDifficultyRule(String level) {
        return switch (level) {
            case "easy" -> " Ràng buộc độ khó: easy => câu ngắn, 1 mệnh đề chính, từ vựng cơ bản, thì đơn giản.";
            case "hard" -> " Ràng buộc độ khó: hard => câu dài hơn, có mệnh đề phụ/cấu trúc phức, từ vựng nâng cao, có thể dùng thì hoàn thành hoặc điều kiện.";
            default -> " Ràng buộc độ khó: medium => câu ghép 2 ý liên kết hợp lý, từ vựng trung bình-khá, ngữ pháp đa dạng hơn easy.";
        };
    }

    private void logUsage(JsonNode root, String operation) {
        JsonNode usage = root.path("usage");
        if (usage.isMissingNode()) {
            return;
        }
        int inputTokens = usage.path("input_tokens").asInt(0);
        int outputTokens = usage.path("output_tokens").asInt(0);
        int totalTokens = usage.path("total_tokens").asInt(inputTokens + outputTokens);
        log.info("openai.{}.usage inputTokens={} outputTokens={} totalTokens={}", operation, inputTokens, outputTokens, totalTokens);
    }
}
