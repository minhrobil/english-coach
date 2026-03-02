package vn.homecredit.englishcoach.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import vn.homecredit.englishcoach.backend.ai.adapter.OpenAiEvaluationClient;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude=" +
                "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration," +
                "org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration," +
                "org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration"
})
class EnglishCoachBackendApplicationTests {

    @MockBean
    JdbcTemplate jdbcTemplate;

    @MockBean
    OpenAiEvaluationClient openAiEvaluationClient;

    @Test
    void contextLoads() {
    }
}
