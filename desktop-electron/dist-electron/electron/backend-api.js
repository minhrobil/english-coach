"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signIn = signIn;
exports.signOut = signOut;
exports.createInstantSession = createInstantSession;
exports.nextPrompt = nextPrompt;
exports.nextPromptWithConfig = nextPromptWithConfig;
exports.submitAnswer = submitAnswer;
exports.getPracticeHistory = getPracticeHistory;
exports.setHistoryHighlight = setHistoryHighlight;
exports.deleteHistory = deleteHistory;
exports.getPracticeConfig = getPracticeConfig;
exports.updatePracticeConfig = updatePracticeConfig;
exports.getManualVocabulary = getManualVocabulary;
exports.addManualVocabulary = addManualVocabulary;
exports.deleteManualVocabulary = deleteManualVocabulary;
exports.getReviewSummary = getReviewSummary;
exports.getReviewSession = getReviewSession;
exports.gradeReviewCard = gradeReviewCard;
async function requestJson(input, init) {
    const response = await fetch(input, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {})
        }
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Request failed: ${response.status} ${response.statusText} ${body}`);
    }
    if (response.status === 204) {
        return {};
    }
    return (await response.json());
}
async function signIn(baseUrl, email, password) {
    return requestJson(`${baseUrl}/api/v1/auth/signin`, {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
}
async function signOut(baseUrl, accessToken) {
    await requestJson(`${baseUrl}/api/v1/auth/signout`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
}
async function createInstantSession(baseUrl, accessToken, topic, level) {
    return requestJson(`${baseUrl}/api/v1/practice/instant-session`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ topic, level })
    });
}
async function nextPrompt(baseUrl, accessToken) {
    return requestJson(`${baseUrl}/api/v1/practice/next-prompt`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
}
async function nextPromptWithConfig(baseUrl, accessToken, topic, level) {
    return requestJson(`${baseUrl}/api/v1/practice/next-prompt`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ topic, level })
    });
}
async function submitAnswer(baseUrl, accessToken, payload) {
    return requestJson(`${baseUrl}/api/v1/practice/submit`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    });
}
async function getPracticeHistory(baseUrl, accessToken, limit) {
    const safeLimit = Math.max(1, limit);
    return requestJson(`${baseUrl}/api/v1/practice/history?limit=${safeLimit}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
}
async function setHistoryHighlight(baseUrl, accessToken, answerId, highlighted) {
    return requestJson(`${baseUrl}/api/v1/practice/history/highlight`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ answerId, highlighted })
    });
}
async function deleteHistory(baseUrl, accessToken, answerIds) {
    return requestJson(`${baseUrl}/api/v1/practice/history`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ answerIds })
    });
}
async function getPracticeConfig(baseUrl, accessToken) {
    return requestJson(`${baseUrl}/api/v1/practice/config`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
}
async function updatePracticeConfig(baseUrl, accessToken, config) {
    return requestJson(`${baseUrl}/api/v1/practice/config`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(config)
    });
}
async function getManualVocabulary(baseUrl, accessToken, limit = 200) {
    return requestJson(`${baseUrl}/api/v1/practice/manual-vocabulary?limit=${Math.max(1, limit)}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
}
async function addManualVocabulary(baseUrl, accessToken, payload) {
    return requestJson(`${baseUrl}/api/v1/practice/manual-vocabulary`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    });
}
async function deleteManualVocabulary(baseUrl, accessToken, items) {
    return requestJson(`${baseUrl}/api/v1/practice/manual-vocabulary`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ items })
    });
}
async function getReviewSummary(baseUrl, accessToken) {
    return requestJson(`${baseUrl}/api/v1/practice/review/summary`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
}
async function getReviewSession(baseUrl, accessToken, limit = 10) {
    return requestJson(`${baseUrl}/api/v1/practice/review/session?limit=${Math.max(1, limit)}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
}
async function gradeReviewCard(baseUrl, accessToken, payload) {
    return requestJson(`${baseUrl}/api/v1/practice/review/grade`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    });
}
