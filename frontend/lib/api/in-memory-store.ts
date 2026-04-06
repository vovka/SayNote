type Job = {
  id: string;
  userId: string;
  clientRecordingId: string;
  idempotencyKey: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed_retryable' | 'failed_terminal';
  audioStorageKey: string;
  audioMimeType: string;
  audioDurationMs?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  noteId?: string;
};

type Category = { id: string; userId: string; name: string; parentId?: string };
type Note = { id: string; userId: string; categoryId: string; sourceJobId: string; text: string; createdAt: string; processedAt: string };
type AIConfig = { primaryProvider: string; transcriptionModel: string; categorizationModel: string; fallbackProvider?: string; fallbackTranscriptionModel?: string; fallbackCategorizationModel?: string };

const jobs = new Map<string, Job>();
const jobsByKey = new Map<string, string>();
const categories = new Map<string, Category>();
const notes = new Map<string, Note>();
const aiConfig = new Map<string, AIConfig>();
const aiCredentialPresence = new Map<string, Set<string>>();

export const store = {
  upsertJob(input: Omit<Job, 'createdAt' | 'updatedAt'>) {
    const existingId = jobsByKey.get(input.idempotencyKey);
    if (existingId) return jobs.get(existingId)!;
    const record: Job = { ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    jobs.set(record.id, record);
    jobsByKey.set(record.idempotencyKey, record.id);
    return record;
  },
  getJob(id: string) {
    return jobs.get(id);
  },
  setAIConfig(userId: string, config: AIConfig) {
    aiConfig.set(userId, config);
  },
  setCredential(userId: string, provider: string) {
    const current = aiCredentialPresence.get(userId) ?? new Set<string>();
    current.add(provider);
    aiCredentialPresence.set(userId, current);
  },
  getAIConfig(userId: string) {
    const config = aiConfig.get(userId);
    const providersWithKey = Array.from(aiCredentialPresence.get(userId) ?? []);
    return { ...config, providersWithKey };
  },
  completeJobWithNote(jobId: string, categoryPath: string[], text: string) {
    const job = jobs.get(jobId);
    if (!job) return;
    const categoryId = ensureCategoryPath(job.userId, categoryPath);
    const noteId = crypto.randomUUID();
    notes.set(noteId, {
      id: noteId,
      userId: job.userId,
      categoryId,
      sourceJobId: job.id,
      text,
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString()
    });
    jobs.set(jobId, { ...job, status: 'completed', noteId, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  },
  getCategoryTreeForUser(userId: string) {
    const userCategories = Array.from(categories.values()).filter((c) => c.userId === userId);
    const userNotes = Array.from(notes.values()).filter((n) => n.userId === userId);

    const byParent = new Map<string | undefined, Category[]>();
    for (const category of userCategories) {
      const arr = byParent.get(category.parentId) ?? [];
      arr.push(category);
      byParent.set(category.parentId, arr);
    }

    function build(parentId?: string): unknown[] {
      return (byParent.get(parentId) ?? []).map((category) => ({
        id: category.id,
        name: category.name,
        notes: userNotes.filter((n) => n.categoryId === category.id).map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt })),
        children: build(category.id)
      }));
    }

    return build(undefined);
  }
};

function ensureCategoryPath(userId: string, path: string[]) {
  let parentId: string | undefined;
  for (const segment of path) {
    const existing = Array.from(categories.values()).find((c) => c.userId === userId && c.parentId === parentId && c.name === segment);
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const id = crypto.randomUUID();
    categories.set(id, { id, userId, name: segment, parentId });
    parentId = id;
  }
  return parentId!;
}
