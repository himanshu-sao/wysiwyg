import React from "react";
import Card from "../components/Card";

const Integrations: React.FC = () => {
  const integrations = [
    {
      title: "GitHub",
      description: "Sync with GitHub repositories and pull requests.",
    },
    {
      title: "Slack",
      description: "Receive notifications and updates in Slack.",
    },
    {
      title: "Figma",
      description: "Import designs and assets from Figma.",
    },
  ];

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Integrations</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((integration, index) => (
          <Card key={index} title={integration.title} description={integration.description} />
        ))}
      </div>
    </div>
  );
};

export default Integrations;
