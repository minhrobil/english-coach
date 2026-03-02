package vn.homecredit.englishcoach.backend.ai.adapter;

import java.util.List;

public interface OpenAiEvaluationClient {

    GeneratedPrompt generatePrompt(GeneratePromptRequest request);

    EvaluationResult evaluate(EvaluationRequest request);

    record GeneratePromptRequest(String topic,
                                 String targetLanguage,
                                 String level,
                                 List<String> recentPrompts,
                                 List<String> rejectedPrompts,
                                 List<String> excludedWords) {
    }

    record PromptHint(String grammarPattern, String formula, List<String> keyVocabulary, String usageNote) {
    }

    record GeneratedPrompt(String direction,
                           String promptText,
                           String referenceAnswer,
                           PromptHint hint,
                           List<String> coreKeywords) {
    }

    record EvaluationRequest(String sourceSentence, String userAnswer, String referenceAnswer, String targetLanguage) {
    }

    record VocabularyHint(String term, String meaningVi, String note) {
    }

    record EvaluationResult(int grammarScore, int naturalnessScore, int vocabularyScore, int overallScore,
                            String explanation, String betterPhrasing, List<VocabularyHint> vocabularyHints) {
    }
}
