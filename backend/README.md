# English Coach Backend

Backend API scaffold cho ứng dụng học tiếng Anh.

## Stack

- Java 21
- Spring Boot 3
- PostgreSQL + Flyway
- JWT (scaffold)

## Run local

```bash
mvn spring-boot:run
```

API health:

```bash
GET http://localhost:8088/actuator/health
```

Auth demo:

```bash
POST http://localhost:8088/api/v1/auth/signin
{
  "email": "admin@english-coach.local",
  "password": "demo"
}
```
