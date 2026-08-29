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
  meetingCheckboxLabel,
} from "@/lib/class-topics";
import { topicContentPlainLength, sanitizeTopicHtml } from "@/lib/topic-html";
import type { ClassRow, ClassTopicRow } from "@/lib/types";
import { TopicContentEditor } from "@/components/TopicContentEditor";

export function ClassTopicForm({
  classes,
  topic,
  initialClassIds,
}: {
  classes: ClassRow[];
  topic?: ClassTopicRow | null;
  initialClassIds?: string[];
}) {
  const router = useRouter();
  const linkedFromTopic =
    topic?.meetings?.map((m) => m.class_id) ||
    (topic?.class_id ? [topic.class_id] : []);
  const seedIds =
    linkedFromTopic.length > 0
      ? linkedFromTopic
      : initialClassIds?.length
        ? initialClassIds
        : classes[0]?.id
          ? [classes[0].id]
          : [];
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(seedIds),
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

  function toggleMeeting(classId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

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
          if (selected.size === 0) {
            event.preventDefault();
          }
        }}
      >
        {topic ? <input type="hidden" name="id" value={topic.id} /> : null}
        <h3 className="announce-form__heading">
          {editing ? "Edit class topic" : "Add class topic"}
        </h3>

        <fieldset className="topic-meetings">
          <legend className="topic-meetings__legend">Meetings</legend>
          <div className="topic-meetings__list">
            {classes.map((cls) => (
              <label key={cls.id} className="topic-meetings__item">
                <input
                  type="checkbox"
                  name="class_ids"
                  value={cls.id}
                  checked={selected.has(cls.id)}
                  onChange={() => toggleMeeting(cls.id)}
                />
                <span>{meetingCheckboxLabel(cls.starts_at)}</span>
              </label>
            ))}
          </div>
          {selected.size === 0 && (
            <p className="error">Choose at least one meeting.</p>
          )}
        </fieldset>

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
              disabled={saving || selected.size === 0}
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
                disabled={saving || selected.size === 0}
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
              <button
                className="btn-primary"
                type="submit"
                name="intent"
                value="publish"
                disabled={saving || selected.size === 0}
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
