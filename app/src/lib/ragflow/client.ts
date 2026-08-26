import { config } from "@/lib/config";

// RAGFlow REST 클라이언트 (외부 서버, Bearer 키)
// 문서: https://ragflow.io/docs/http_api_reference
export interface RagChunk {
  id: string;
  content: string;
  similarity: number;
  document_id?: string;
  document_name?: string;
  document_keyword?: string;
}

export class RagflowClient {
  private base: string;
  private key: string;

  constructor(baseUrl = config.ragflow.baseUrl, apiKey = config.ragflow.apiKey) {
    this.base = baseUrl.replace(/\/$/, "");
    this.key = apiKey;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`RAGFlow API ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async listDatasets() {
    const d = await this.request<{ code: number; data: Array<{ id: string; name: string }> }>("/api/v1/datasets");
    return d.data;
  }

  async createDataset(name: string) {
    const d = await this.request<{ code: number; data: { id: string } }>("/api/v1/datasets", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return d.data.id;
  }

  async uploadDocument(datasetId: string, filename: string, blob: Blob) {
    const form = new FormData();
    form.append("file", blob, filename);
    const res = await fetch(`${this.base}/api/v1/datasets/${datasetId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}` },
      body: form,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`upload failed ${res.status}`);
    return (await res.json()) as { code: number; data: { id: string } };
  }

  async parseDocuments(datasetId: string, docIds: string[]) {
    return this.request(`/api/v1/datasets/${datasetId}/chunks`, {
      method: "POST",
      body: JSON.stringify({ document_ids: docIds }),
    });
  }

  async retrieve(question: string, datasetIds: string[], topK = config.rag.topK, similarityThreshold = config.rag.similarityThreshold): Promise<RagChunk[]> {
    const d = await this.request<{ code: number; data: { chunks: any[] } }>("/api/v1/retrieval", {
      method: "POST",
      body: JSON.stringify({ question, dataset_ids: datasetIds, top_k: topK, similarity_threshold: similarityThreshold, page: 1, page_size: topK }),
    });
    // RAGFlow가 반환하는 문서명은 document_keyword(파일명) 필드. document_name으로 정규화.
    return (d.data?.chunks ?? []).map((c) => ({
      id: String(c?.id ?? ""),
      content: String(c?.content ?? ""),
      similarity: Number(c?.similarity ?? 0),
      document_id: c?.document_id,
      document_keyword: c?.document_keyword,
      document_name: String(c?.document_name ?? c?.document_keyword ?? ""),
    }));
  }

  async listDatasetDocuments(datasetId: string): Promise<RagDocumentEntry[]> {
    const d = await this.request<{ code: number; data: { docs: Array<Record<string, unknown>> } }>(
      `/api/v1/datasets/${datasetId}/documents`
    );
    return (d.data?.docs ?? []).map((doc) => ({
      id: String(doc.id ?? ""),
      name: String(doc.name ?? doc.filename ?? ""),
      runStatus: normalizeRun(doc.run ?? doc.run_status),
      progress: typeof doc.progress === "number" ? doc.progress : -1,
    }));
  }
}

export interface RagDocumentEntry {
  id: string;
  name: string;
  // RAGFlow 런 상태 원본 (정규화: "UNSTART"|"RUNNING"|"DONE"|"FAIL"|"CANCEL")
  runStatus: string;
  progress: number;
}

function normalizeRun(run: unknown): string {
  if (typeof run === "string") return run.toUpperCase();
  if (run && typeof run === "object") {
    const st = (run as { status?: unknown }).status;
    if (typeof st === "string") return st.toUpperCase();
  }
  return "";
}


// 싱글턴
export const ragflow = new RagflowClient();
