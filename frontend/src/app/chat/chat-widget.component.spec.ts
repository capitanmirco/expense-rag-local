import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { Subject, of, throwError } from "rxjs";
import { ChatWidgetComponent } from "./chat-widget.component";
import { ChatApiService } from "../core/chat-api.service";

const chatServiceMock = {
  send: jasmine.createSpy("send"),
  uploadPdf: jasmine.createSpy("uploadPdf"),
  getModels: jasmine.createSpy("getModels").and.returnValue(of({ models: [] })),
  getQuota: jasmine.createSpy("getQuota").and.returnValue(of({ quotaSnapshots: {} })),
};

describe("ChatWidgetComponent", () => {
  let component: ChatWidgetComponent;
  let fixture: ComponentFixture<ChatWidgetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatWidgetComponent, ReactiveFormsModule],
      providers: [{ provide: ChatApiService, useValue: chatServiceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatWidgetComponent);
    component = fixture.componentInstance;
    chatServiceMock.send.calls.reset();
    chatServiceMock.uploadPdf.calls.reset();
    fixture.detectChanges();
  });

  // ─── initial state ─────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with empty messages list", () => {
      expect(component.messages()).toEqual([]);
    });

    it("starts with sending = false", () => {
      expect(component.sending()).toBe(false);
    });

    it("starts with session = 0", () => {
      expect(component.session()).toBe(0);
    });

    it("starts with uploading = false", () => {
      expect(component.uploading()).toBe(false);
    });

    it("starts with uploadMessage = null", () => {
      expect(component.uploadMessage()).toBeNull();
    });
  });

  // ─── newChat ───────────────────────────────────────────────────────────────

  describe("newChat()", () => {
    it("increments session counter", () => {
      component.newChat();
      expect(component.session()).toBe(1);
    });

    it("clears messages", () => {
      component.messages.set([{ role: "user", content: "hi" }]);
      component.newChat();
      expect(component.messages()).toEqual([]);
    });

    it("resets sending flag", () => {
      component.sending.set(true);
      component.newChat();
      expect(component.sending()).toBe(false);
    });

    it("resets uploading and uploadMessage", () => {
      component.uploading.set(true);
      component.uploadMessage.set("something");
      component.newChat();
      expect(component.uploading()).toBe(false);
      expect(component.uploadMessage()).toBeNull();
    });
  });

  // ─── send ──────────────────────────────────────────────────────────────────

  describe("send()", () => {
    it("does nothing when text is empty", () => {
      component.form.controls.text.setValue("");
      component.send();
      expect(chatServiceMock.send).not.toHaveBeenCalled();
    });

    it("adds user message to list and calls chat service", fakeAsync(() => {
      chatServiceMock.send.and.returnValue(of({ reply: "Ciao!", sources: [] }));
      component.form.controls.text.setValue("Elenca spese");

      component.send();
      tick();

      const msgs = component.messages();
      expect(msgs.some(m => m.role === "user" && m.content === "Elenca spese")).toBe(true);
    }));

    it("appends assistant reply after successful response", fakeAsync(() => {
      chatServiceMock.send.and.returnValue(of({ reply: "Hai 2 spese.", sources: [] }));
      component.form.controls.text.setValue("Quante spese ho?");

      component.send();
      tick();

      const msgs = component.messages();
      expect(msgs.some(m => m.role === "assistant" && m.content === "Hai 2 spese.")).toBe(true);
    }));

    it("resets sending to false after successful response", fakeAsync(() => {
      chatServiceMock.send.and.returnValue(of({ reply: "ok", sources: [] }));
      component.form.controls.text.setValue("ciao");

      component.send();
      tick();

      expect(component.sending()).toBe(false);
    }));

    it("appends error message on chat service error", fakeAsync(() => {
      chatServiceMock.send.and.returnValue(throwError(() => new Error("Network error")));
      component.form.controls.text.setValue("ciao");

      component.send();
      tick();

      const msgs = component.messages();
      expect(msgs.some(m => m.role === "assistant" && m.content.includes("Errore"))).toBe(true);
    }));

    it("ignores response if session changed during request", fakeAsync(() => {
      const subject = new Subject<{ reply: string; sources: any[] }>();
      chatServiceMock.send.and.returnValue(subject.asObservable());
      component.form.controls.text.setValue("hello");

      component.send();
      // Change session BEFORE the observable emits
      component.session.set(999);

      // Now emit – the handler should detect session mismatch and skip appending
      subject.next({ reply: "late reply", sources: [] });
      subject.complete();
      tick();

      const msgs = component.messages();
      // assistant message is NOT added because session mismatch
      expect(msgs.filter(m => m.role === "assistant").length).toBe(0);
    }));

    it("resets form after sending", fakeAsync(() => {
      chatServiceMock.send.and.returnValue(of({ reply: "ok", sources: [] }));
      component.form.controls.text.setValue("test");

      component.send();
      tick();

      expect(component.form.controls.text.value).toBe("");
    }));
  });

  // ─── uploadFile ────────────────────────────────────────────────────────────

  describe("uploadFile()", () => {
    it("does nothing if no file selected", () => {
      const event = { target: { files: null } } as unknown as Event;
      component.uploadFile(event);
      expect(chatServiceMock.uploadPdf).not.toHaveBeenCalled();
    });

    it("sets uploading=true and initial message when file selected", fakeAsync(() => {
      const subject = new Subject<{ ok: boolean; chunks: number; mdFile: string; docId: string }>();
      chatServiceMock.uploadPdf.and.returnValue(subject.asObservable());

      const file = new File(["pdf data"], "test.pdf", { type: "application/pdf" });
      const input = { files: [file], value: "" } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;

      component.uploadFile(event);

      // Check state BEFORE the observable emits (still pending)
      expect(component.uploading()).toBe(true);
      expect(component.uploadMessage()).toBe("Caricamento PDF in corso...");

      subject.next({ ok: true, chunks: 2, mdFile: "test.md", docId: "x" });
      subject.complete();
      tick();
    }));

    it("sets success message and uploading=false on success", fakeAsync(() => {
      chatServiceMock.uploadPdf.and.returnValue(of({ ok: true, chunks: 2, mdFile: "fattura.md", docId: "x" }));

      const file = new File(["pdf data"], "fattura.pdf", { type: "application/pdf" });
      const input = { files: [file], value: "" } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;

      component.uploadFile(event);
      tick();

      expect(component.uploading()).toBe(false);
      expect(component.uploadMessage()).toContain("fattura.md");
    }));

    it("sets error message and uploading=false on upload error", fakeAsync(() => {
      chatServiceMock.uploadPdf.and.returnValue(throwError(() => new Error("upload failed")));

      const file = new File(["pdf data"], "broken.pdf", { type: "application/pdf" });
      const input = { files: [file], value: "" } as unknown as HTMLInputElement;
      const event = { target: input } as unknown as Event;

      component.uploadFile(event);
      tick();

      expect(component.uploading()).toBe(false);
      expect(component.uploadMessage()).toContain("Errore");
    }));
  });
});
