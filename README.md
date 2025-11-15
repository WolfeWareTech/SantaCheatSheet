## AWS Amplify React+Vite Starter Template

This repository provides a starter template for creating applications using React+Vite and AWS Amplify, emphasizing easy setup for authentication, API, and database capabilities.

## Overview

This template equips you with a foundational React application integrated with AWS Amplify, streamlined for scalability and performance. It is ideal for developers looking to jumpstart their project with pre-configured AWS services like Cognito, AppSync, and DynamoDB.

## Features

- **Authentication**: Setup with Amazon Cognito for secure user authentication.
- **API**: Ready-to-use GraphQL endpoint with AWS AppSync.
- **Database**: Real-time database powered by Amazon DynamoDB.
- **Admin backup/import tool**: In-app panel (shown to admin users) to export all SantasSheet records before schema changes and re-import them after deploying new models.
- **Santa layout**: Frontend styled to mimic the original paper cheat sheet. Drop your artwork into `public/images/Santa.png` and `public/images/SantaStamp.png` to see the graphics in the header.

## Styling and imports (important)

- `src/main.tsx` must import the Amplify UI styles **before** `App.css`:
  ```ts
  import "@aws-amplify/ui-react/styles.css";
  import "./App.css";
  ```
  This ensures our custom styles override the Amplify defaults.
- `App.css` only aggregates modular styles in `src/styles/` (`layout.css`, `header.css`, `form.css`, `signature.css`, `admin-panel.css`, `responsive.css`). Edit those files directly instead of reintroducing a monolithic stylesheet.
- `index.css` is intentionally minimal (body/main defaults) to avoid clobbering component styles.
- After changing global/import order, restart `npm run dev` and hard-refresh the browser to avoid cached CSS.

## Assets

Place the header artwork at:
- `public/images/Santa.png`
- `public/images/SantaStamp.png`

## Workflow reminders

- Backend changes: edit `amplify/data/resource.ts` and deploy with `npx ampx sandbox --identifier GamingPC --once`.
- Data backups: use the admin panel to **Export current data** before schema changes and **Import from JSON** after deploying.

## Deploying to AWS

For detailed instructions on deploying your application, refer to the [deployment section](https://docs.amplify.aws/react/start/quickstart/#deploy-a-fullstack-app-to-aws) of our documentation.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
