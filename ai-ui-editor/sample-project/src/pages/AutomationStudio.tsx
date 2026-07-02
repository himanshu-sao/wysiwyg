import React from "react";
import Button from "../components/Button";

const AutomationStudio: React.FC = () => {
  const handleRunWorkflow = () => {
    alert("Workflow started!");
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Automation Studio</h1>
      <div className="flex flex-col space-y-4">
        <Button onClick={handleRunWorkflow} variant="primary" size="lg">
          Run Workflow
        </Button>
        <Button variant="secondary" size="md">
          Save Draft
        </Button>
        <Button variant="danger" size="sm">
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default AutomationStudio;
