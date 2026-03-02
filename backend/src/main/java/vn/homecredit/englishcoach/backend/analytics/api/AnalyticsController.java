package vn.homecredit.englishcoach.backend.analytics.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {

    @GetMapping("/me/progress")
    public ResponseEntity<Map<String, Object>> myProgress() {
        return ResponseEntity.ok(Map.of(
                "streakDays", 3,
                "weeklyAverageScore", 76,
                "weakTopics", new String[]{"daily_small_talk", "email_writing"}
        ));
    }
}
