import React from "react";
import { Upload } from "lucide-react";
import { ToolBarButton } from "../components/ToolBarButton";

export const SyncButton: React.FC = () => {
  const handleRestoreSession = async () => {
    console.log("Restoring session data...");
    const result = await window.topBarAPI.restoreSessionData();
    if (result.success) {
      console.log("Session data restored from:", result.filePath);
    } else {
      console.error("Failed to restore session:", result.error);
    }
  };

  return <ToolBarButton Icon={Upload} onClick={handleRestoreSession} />;
};
