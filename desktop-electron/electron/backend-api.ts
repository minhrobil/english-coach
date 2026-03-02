import type {
  AppConfig,
  ManualVocabularyItem,
  PracticeHistoryItemResponse,
  PracticePromptResponse,
  PracticeSubmitResponse,
  ReviewCard,
  ReviewGradeResponse,
  ReviewSummary,
  SignInResponse
} from '../src/types';

type Json = Record<string, unknown>;

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
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
    return {} as T;
  }

  return (await response.json()) as T;
}

export async function signIn(baseUrl: string, email: string, password: string): Promise<SignInResponse> {
  return requestJson<SignInResponse>(`${baseUrl}/api/v1/auth/signin`, {
    method: 'POST',
    body: JSON.stringify({ email, password } satisfies Json)
  });
}

export async function signOut(baseUrl: string, accessToken: string): Promise<void> {
  await requestJson<void>(`${baseUrl}/api/v1/auth/signout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export async function createInstantSession(
  baseUrl: string,
  accessToken: string,
  topic: string,
  level: string
): Promise<PracticePromptResponse> {
  return requestJson<PracticePromptResponse>(`${baseUrl}/api/v1/practice/instant-session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ topic, level } satisfies Json)
  });
}

export async function nextPrompt(baseUrl: string, accessToken: string): Promise<PracticePromptResponse> {
  return requestJson<PracticePromptResponse>(`${baseUrl}/api/v1/practice/next-prompt`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export async function nextPromptWithConfig(
  baseUrl: string,
  accessToken: string,
  topic: string,
  level: string
): Promise<PracticePromptResponse> {
  return requestJson<PracticePromptResponse>(`${baseUrl}/api/v1/practice/next-prompt`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ topic, level } satisfies Json)
  });
}

export async function submitAnswer(
  baseUrl: string,
  accessToken: string,
  payload: {
    promptId: string;
    sourceSentence: string;
    referenceAnswer: string;
    answerText: string;
  }
): Promise<PracticeSubmitResponse> {
  return requestJson<PracticeSubmitResponse>(`${baseUrl}/api/v1/practice/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export async function getPracticeHistory(
  baseUrl: string,
  accessToken: string,
  limit: number
): Promise<PracticeHistoryItemResponse[]> {
  const safeLimit = Math.max(1, limit);
  return requestJson<PracticeHistoryItemResponse[]>(`${baseUrl}/api/v1/practice/history?limit=${safeLimit}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export async function setHistoryHighlight(
  baseUrl: string,
  accessToken: string,
  answerId: string,
  highlighted: boolean
): Promise<{ answerId: string; highlighted: boolean; changed: boolean }> {
  return requestJson(`${baseUrl}/api/v1/practice/history/highlight`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ answerId, highlighted } satisfies Json)
  });
}

export async function deleteHistory(
  baseUrl: string,
  accessToken: string,
  answerIds: string[]
): Promise<{ deletedCount: number }> {
  return requestJson(`${baseUrl}/api/v1/practice/history`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ answerIds } satisfies Json)
  });
}

export async function getPracticeConfig(baseUrl: string, accessToken: string): Promise<AppConfig> {
  return requestJson<AppConfig>(`${baseUrl}/api/v1/practice/config`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export async function updatePracticeConfig(baseUrl: string, accessToken: string, config: AppConfig): Promise<AppConfig> {
  return requestJson<AppConfig>(`${baseUrl}/api/v1/practice/config`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(config)
  });
}

export async function getManualVocabulary(
  baseUrl: string,
  accessToken: string,
  limit: number = 200
): Promise<ManualVocabularyItem[]> {
  return requestJson<ManualVocabularyItem[]>(`${baseUrl}/api/v1/practice/manual-vocabulary?limit=${Math.max(1, limit)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export async function addManualVocabulary(
  baseUrl: string,
  accessToken: string,
  payload: {
    sourceAnswerId: string;
    term: string;
    meaningVi: string;
    note: string;
    sourceContext: string;
  }
): Promise<ManualVocabularyItem> {
  return requestJson<ManualVocabularyItem>(`${baseUrl}/api/v1/practice/manual-vocabulary`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

export async function deleteManualVocabulary(
  baseUrl: string,
  accessToken: string,
  items: Array<{ sourceAnswerId: string; term: string }>
): Promise<{ deletedCount: number }> {
  return requestJson(`${baseUrl}/api/v1/practice/manual-vocabulary`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ items } satisfies Json)
  });
}

export async function getReviewSummary(baseUrl: string, accessToken: string): Promise<ReviewSummary> {
  return requestJson<ReviewSummary>(`${baseUrl}/api/v1/practice/review/summary`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export async function getReviewSession(baseUrl: string, accessToken: string, limit: number = 10): Promise<ReviewCard[]> {
  return requestJson<ReviewCard[]>(`${baseUrl}/api/v1/practice/review/session?limit=${Math.max(1, limit)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export async function gradeReviewCard(
  baseUrl: string,
  accessToken: string,
  payload: { cardId: string; quality: number }
): Promise<ReviewGradeResponse> {
  return requestJson<ReviewGradeResponse>(`${baseUrl}/api/v1/practice/review/grade`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
}

