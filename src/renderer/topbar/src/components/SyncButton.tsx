import React from "react";
import { Download } from "lucide-react";
import { ToolBarButton } from "../components/ToolBarButton";

export const SyncButton: React.FC = () => {
  const handleRestoreSession = async () => {
    console.log("Restoring session data...");
    const result = await window.topBarAPI.restoreSessionData();
    if (result.success) {
      console.log("Session data restored from server");
    } else {
      console.error("Failed to restore session:", result.error);
    }
  };

  return <ToolBarButton Icon={Download} onClick={handleRestoreSession} />;
};
