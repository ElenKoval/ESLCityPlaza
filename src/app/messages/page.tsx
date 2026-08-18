import type { Metadata } from "next";
import { requireApproved } from "@/lib/auth";
import { loadDirectConversationList } from "@/lib/load-direct-messages";
import { DirectMessagesApp } from "@/components/DirectMessagesApp";
import { sitePageTitle } from "@/lib/site-name";

export const metadata: Metadata = {
  title: sitePageTitle("Direct Messages"),
};

export default async function DirectMessagesPage() {
  const { userId } = await requireApproved();
  const { items, setupNeeded } = await loadDirectConversationList(userId);

  return (
    <div className="dm-page">
      <DirectMessagesApp
        userId={userId}
        conversations={items}
        setupNeeded={setupNeeded}
      />
    </div>
  );
}
