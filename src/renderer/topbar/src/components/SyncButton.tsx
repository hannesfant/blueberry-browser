import React from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { ToolBarButton } from "../components/ToolBarButton";

export const SyncButton: React.FC = () => {
  const handleRestoreSession = async () => {
    const result = await window.topBarAPI.restoreSessionData();
    if (result.success) {
      toast.success("Session restored successfully");
    } else {
      toast.error(`Failed to restore session: ${result.error}`);
    }
  };

  return <ToolBarButton Icon={Download} onClick={handleRestoreSession} />;
};
