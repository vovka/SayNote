export interface TranscriptionResult {
  text: string;
  raw?: unknown;
}

export interface CategorizationCategorySummary {
  id: string;
  path: string;
  depth: number;
  isLocked: boolean;
  noteCount: number;
}

export interface CategorizationNoteSummary {
  id: string;
  text: string;
  currentCategoryId: string;
  currentCategoryPath: string;
  isInLockedSubtree: boolean;
}

export interface UnifiedCategorizationRequest {
  newNote: {
    text: string;
    createdAt: string;
  };
  existingCategories: CategorizationCategorySummary[];
  existingNotes: CategorizationNoteSummary[];
  rules: {
    reuseExistingCategoryWhenItFits: boolean;
    allDepthsAreEquallyValid: boolean;
    doNotPreferNestedCategories: boolean;
    doNotMoveLockedSubtrees: boolean;
    omitLowConfidenceRecategorizations: boolean;
  };
}

export interface UnifiedAssignment {
  selectedCategoryId?: string;
  newCategoryPath?: string;
  confidence?: number;
  reason?: string;
}

export interface UnifiedRecategorization extends UnifiedAssignment {
  noteId: string;
}

export interface CategorizeWithReviewResult {
  newNoteAssignment: UnifiedAssignment;
  recategorizations: UnifiedRecategorization[];
  raw?: unknown;
}

export interface AIProviderAdapter {
  transcribe(input: {
    audioUrl?: string;
    audioBuffer?: Buffer;
    model: string;
    apiKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<TranscriptionResult>;

  categorizeWithReview(input: {
    model: string;
    apiKey: string;
    payload: UnifiedCategorizationRequest;
  }): Promise<CategorizeWithReviewResult>;
}
