import React from "react";
import { Upload } from "lucide-react";
import { ToolBarButton } from "../components/ToolBarButton";

export const DumpButton: React.FC = () => {
  const handleDumpSession = async () => {
    console.log("Dumping session data...");
    const result = await window.topBarAPI.dumpSessionData();
    if (result.success) {
      console.log("Session data synced to server");
    } else {
      console.error("Failed to dump session:", result.error);
    }
  };

  return <ToolBarButton Icon={Upload} onClick={handleDumpSession} />;
};
