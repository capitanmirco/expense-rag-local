import { TestBed } from "@angular/core/testing";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { ChatApiService, ChatMsg } from "./chat-api.service";
import { CHAT_BASE_URL } from "./api.config";

describe("ChatApiService", () => {
  let service: ChatApiService;
  let httpMock: HttpTestingController;

  const messages: ChatMsg[] = [
    { role: "user", content: "Elenca le spese" },
    { role: "assistant", content: "Ecco le tue spese..." },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ChatApiService],
    });
    service = TestBed.inject(ChatApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ─── send ──────────────────────────────────────────────────────────────────

  describe("send()", () => {
    it("sends POST to /chat with full message array", () => {
      service.send(messages).subscribe((resp) => {
        expect(resp.reply).toBe("Hai 3 spese.");
      });

      const req = httpMock.expectOne(`${CHAT_BASE_URL}/chat`);
      expect(req.request.method).toBe("POST");
      expect(req.request.body).toEqual({ messages });
      req.flush({ reply: "Hai 3 spese.", sources: [] });
    });

    it("includes sources in response when present", () => {
      service.send(messages).subscribe((resp) => {
        expect(resp.sources).toBeDefined();
        expect(resp.sources?.length).toBe(1);
      });

      const req = httpMock.expectOne(`${CHAT_BASE_URL}/chat`);
      req.flush({ reply: "risposta", sources: [{ source: "doc.pdf" }] });
    });
  });

  // ─── uploadPdf ─────────────────────────────────────────────────────────────

  describe("uploadPdf()", () => {
    it("sends POST to /rag/upload with FormData", () => {
      const file = new File(["dummy content"], "test.pdf", { type: "application/pdf" });

      service.uploadPdf(file).subscribe((resp) => {
        expect(resp.ok).toBe(true);
        expect(resp.chunks).toBe(3);
        expect(resp.mdFile).toBe("test-abc12345.md");
      });

      const req = httpMock.expectOne(`${CHAT_BASE_URL}/rag/upload`);
      expect(req.request.method).toBe("POST");
      expect(req.request.body instanceof FormData).toBe(true);
      req.flush({ ok: true, chunks: 3, mdFile: "test-abc12345.md", docId: "abc12345" });
    });

    it("FormData contains the file under key 'file'", () => {
      const file = new File(["content"], "invoice.pdf", { type: "application/pdf" });

      service.uploadPdf(file).subscribe();

      const req = httpMock.expectOne(`${CHAT_BASE_URL}/rag/upload`);
      const fd = req.request.body as FormData;
      const uploaded = fd.get("file") as File;
      expect(uploaded).toBeTruthy();
      expect(uploaded.name).toBe("invoice.pdf");
      req.flush({ ok: true, chunks: 1, mdFile: "invoice-x.md", docId: "x" });
    });
  });
});
