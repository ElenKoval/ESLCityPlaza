"use client";

import { useEffect, useRef, useState } from "react";
import { CLASS_TOPIC_CONTENT_MAX } from "@/lib/class-topics";
import { importTopicFile } from "@/lib/topic-import";
import {
  sanitizeTopicHtml,
  topicContentPlainLength,
  topicContentToEditorHtml,
} from "@/lib/topic-html";

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function TopicContentEditor({
  initialContent,
}: {
  initialContent: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  const [content, setContent] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!editorRef.current || initialized.current) return;
    const html = topicContentToEditorHtml(initialContent);
    editorRef.current.innerHTML = html;
    setContent(html);
    initialized.current = true;
  }, [initialContent]);

  function syncFromEditor() {
    const el = editorRef.current;
    if (!el) return;
    setContent(sanitizeTopicHtml(el.innerHTML));
  }

  function setEditorHtml(html: string) {
    const clean = sanitizeTopicHtml(html);
    if (editorRef.current) {
      editorRef.current.innerHTML = clean;
    }
    setContent(clean);
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setImportError(null);

    const currentText = editorRef.current?.innerText.trim() || "";
    if (
      currentText &&
      !confirm(
        "Replace the current topic text with the imported file? You can still edit before saving.",
      )
    ) {
      return;
    }

    setImporting(true);
    try {
      const html = await importTopicFile(file);
      setEditorHtml(html);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Could not import that file.",
      );
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const plainLength = topicContentPlainLength(content);
  const tooLong = plainLength > CLASS_TOPIC_CONTENT_MAX;

  return (
    <div className="topic-editor-wrap">
      <label className="topic-editor-label">Questions / text</label>
      <div className="topic-editor-toolbar">
        <div className="topic-editor-toolbar__formats">
          <button
            type="button"
            className="topic-editor-toolbar__btn"
            aria-label="Bold"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              exec("bold");
              syncFromEditor();
            }}
          >
            B
          </button>
          <button
            type="button"
            className="topic-editor-toolbar__btn"
            aria-label="Italic"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              exec("italic");
              syncFromEditor();
            }}
          >
            I
          </button>
          <button
            type="button"
            className="topic-editor-toolbar__btn"
            aria-label="Bulleted list"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              exec("insertUnorderedList");
              syncFromEditor();
            }}
          >
            •
          </button>
          <button
            type="button"
            className="topic-editor-toolbar__btn"
            aria-label="Numbered list"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              exec("insertOrderedList");
              syncFromEditor();
            }}
          >
            1.
          </button>
        </div>
        <button
          type="button"
          className="topic-editor-import-btn"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
        >
          {importing ? "Importing…" : "Import file"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(e) => void onPickFile(e.target.files?.[0])}
        />
      </div>
      <div
        ref={editorRef}
        className="topic-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Questions and text for this class topic"
        onInput={syncFromEditor}
        onBlur={syncFromEditor}
      />
      <input type="hidden" name="content" value={content} readOnly required />
      <p className="field-hint">
        Use bold, italic, and lists as needed. You can also import a .docx or
        .txt file (up to 5 MB).
      </p>
      {tooLong && (
        <p className="error">
          Topic text is too long ({plainLength.toLocaleString()} /{" "}
          {CLASS_TOPIC_CONTENT_MAX.toLocaleString()} characters).
        </p>
      )}
      {importError && <p className="error">{importError}</p>}
    </div>
  );
}
