import React from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { ToolBarButton } from "../components/ToolBarButton";

export const DumpButton: React.FC = () => {
  const handleDumpSession = async () => {
    const result = await window.topBarAPI.dumpSessionData();
    if (result.success) {
      toast.success("Session synced successfully");
    } else {
      toast.error(`Failed to sync session: ${result.error}`);
    }
  };

  return <ToolBarButton Icon={Upload} onClick={handleDumpSession} />;
};
