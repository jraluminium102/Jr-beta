"use client";
import { IssueDetail } from "@/components/issues/IssueDetail";

export default function IssueDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto fade-in">
      <IssueDetail issueId={params.id} />
    </div>
  );
}
