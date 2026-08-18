"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteClassTopic,
  saveClassTopic,
  setClassTopicPublished,
  type ActionState,
} from "@/app/actions";
import {
  CLASS_TOPIC_CONTENT_MAX,
  CLASS_TOPIC_TITLE_MAX,
  classTopicWhenLabel,
} from "@/lib/class-topics";
import { topicContentPlainLength, sanitizeTopicHtml } from "@/lib/topic-html";
import type { ClassRow, ClassTopicRow } from "@/lib/types";
import { TopicContentEditor } from "@/components/TopicContentEditor";

export function ClassTopicForm({
  classes,
  existingByClass,
  topic,
}: {
  classes: ClassRow[];
  existingByClass: Record<string, string>;
  topic?: ClassTopicRow | null;
}) {
  const router = useRouter();
  const [classId, setClassId] = useState(
    topic?.class_id || classes[0]?.id || "",
  );
  const [saveState, saveAction, saving] = useActionState<ActionState, FormData>(
    saveClassTopic,
    null,
  );
  const [pubState, pubAction, publishing] = useActionState<
    ActionState,
    FormData
  >(setClassTopicPublished, null);
  const [delState, delAction, deleting] = useActionState<ActionState, FormData>(
    deleteClassTopic,
    null,
  );

  useEffect(() => {
    if (pubState?.success) router.refresh();
  }, [pubState, router]);

  const editing = Boolean(topic);
  const published = Boolean(topic?.is_published);

  return (
    <div className="stack">
      <form
        action={saveAction}
        className="panel form-grid"
        onSubmit={(event) => {
          const form = event.currentTarget;
          const editor = form.querySelector(
            ".topic-editor",
          ) as HTMLDivElement | null;
          const input = form.elements.namedItem(
            "content",
          ) as HTMLInputElement | null;
          if (editor && input) {
            input.value = sanitizeTopicHtml(editor.innerHTML);
          }
          const value = input?.value || "";
          if (topicContentPlainLength(value) > CLASS_TOPIC_CONTENT_MAX) {
            event.preventDefault();
          }
        }}
      >
        {topic ? <input type="hidden" name="id" value={topic.id} /> : null}
        <h3 className="announce-form__heading">
          {editing ? "Edit class topic" : "Add class topic"}
        </h3>
        <label>
          Class
          <select
            name="class_id"
            required
            value={classId}
            onChange={(event) => {
              const next = event.target.value;
              const existingId = existingByClass[next];
              if (existingId && existingId !== topic?.id) {
                router.push(`/topics/${existingId}/edit`);
                return;
              }
              setClassId(next);
            }}
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {classTopicWhenLabel(cls.starts_at)}
                {existingByClass[cls.id] && existingByClass[cls.id] !== topic?.id
                  ? " · has topic"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Topic title
          <input
            name="title"
            required
            maxLength={CLASS_TOPIC_TITLE_MAX}
            defaultValue={topic?.title || ""}
            placeholder="Animals"
          />
        </label>
        <TopicContentEditor initialContent={topic?.content || ""} />
        {saveState?.error && <p className="error">{saveState.error}</p>}
        <div className="class-actions">
          {editing ? (
            <button
              className="btn-secondary"
              type="submit"
              name="intent"
              value="save"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          ) : (
            <>
              <button
                className="btn-secondary"
                type="submit"
                name="intent"
                value="draft"
                disabled={saving}
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
              <button
                className="btn-primary"
                type="submit"
                name="intent"
                value="publish"
                disabled={saving}
              >
                {saving ? "Saving…" : "Publish"}
              </button>
            </>
          )}
        </div>
      </form>

      {editing && topic && (
        <div className="class-actions">
          <form action={pubAction}>
            <input type="hidden" name="id" value={topic.id} />
            <input
              type="hidden"
              name="published"
              value={published ? "false" : "true"}
            />
            <button className="btn-secondary" type="submit" disabled={publishing}>
              {publishing
                ? "Saving…"
                : published
                  ? "Unpublish"
                  : "Publish"}
            </button>
          </form>
          <form
            action={delAction}
            onSubmit={(event) => {
              if (!confirm("Delete this class topic? This cannot be undone.")) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={topic.id} />
            <button className="btn-danger" type="submit" disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </form>
        </div>
      )}
      {pubState?.error && <p className="error">{pubState.error}</p>}
      {pubState?.success && <p className="success">{pubState.success}</p>}
      {delState?.error && <p className="error">{delState.error}</p>}
    </div>
  );
}
