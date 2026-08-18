import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import {
  loadDirectConversationList,
  loadDirectThread,
  persistDirectConversationRead,
} from "@/lib/load-direct-messages";
import { signDirectImagePaths } from "@/app/dm-actions";
import { DirectMessagesApp } from "@/components/DirectMessagesApp";
import { sitePageTitle } from "@/lib/site-name";

export const metadata: Metadata = {
  title: sitePageTitle("Direct Messages"),
};

export default async function DirectMessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await requireApproved();
  const { thread, setupNeeded: threadSetup, error } =
    await loadDirectThread(id, userId);
  if (thread) {
    await persistDirectConversationRead(userId, id);
  }
  const { items, setupNeeded } = await loadDirectConversationList(userId);

  if (!thread) {
    if (setupNeeded || threadSetup) {
      return (
        <div className="dm-page">
          <DirectMessagesApp
            userId={userId}
            conversations={items}
            setupNeeded
          />
        </div>
      );
    }
    if (error) notFound();
    notFound();
  }

  const imageUrls = await signDirectImagePaths(
    thread.messages
      .map((row) => row.image_path)
      .filter((path): path is string => Boolean(path)),
  );

  return (
    <div className="dm-page">
      <DirectMessagesApp
        userId={userId}
        conversations={items}
        activeId={thread.conversation.id}
        otherName={thread.otherName}
        otherId={thread.otherId}
        otherRole={thread.otherRole}
        blockedByMe={thread.blockedByMe}
        blockedEitherWay={thread.blockedEitherWay}
        messages={thread.messages.map((msg) => ({
          ...msg,
          imageUrl: msg.image_path ? (imageUrls[msg.image_path] ?? null) : null,
        }))}
        setupNeeded={setupNeeded || threadSetup}
      />
    </div>
  );
}
