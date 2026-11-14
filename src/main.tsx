import React from "react";
import ReactDOM from "react-dom/client";
import { FestiveAuthenticator } from "./features/auth/festive/FestiveAuthenticator";
import App from "./App.tsx";
import "@aws-amplify/ui-react/styles.css";
import "./App.css";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";

Amplify.configure(outputs);

const formFields = {
  signUp: {
    given_name: {
      order: 3,
      label: "First name",
      placeholder: "First name",
      isRequired: true,
    },
    family_name: {
      order: 4,
      label: "Last name",
      placeholder: "Last name",
      isRequired: true,
    },
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FestiveAuthenticator formFields={formFields}>
      <App />
    </FestiveAuthenticator>
  </React.StrictMode>
);
