# Changelog

## 0.1.0

First release.

- **Formy Trigger**: starts a workflow when a Formy form receives a new submission. Subscribes
  through Formy's API when the workflow is activated and unsubscribes when it is deactivated.
  Adds `answers`, the submission's answers keyed by field name.
- **Formy**: Workspace › Get Many; Form › Get Many, Get Fields; Signing Request › Create, with
  prefilled answers mapped per field.
- **Formy API** credential: a Formy personal access token, tested against `/external/validate`.
