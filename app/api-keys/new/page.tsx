import { CreateApiKeyForm } from '@/components/create-api-key-form';
import { createApiKey } from '@/lib/actions/api-keys';

export default function NewApiKeyPage() {
  return (
    <div className="container py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create New API Key</h1>
        <p className="text-muted-foreground mt-1">
          Create an API key to access Brok programmatically
        </p>
      </div>

      <CreateApiKeyForm action={createApiKey} />

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <strong>Warning:</strong> Your API key will only be shown once after creation.
          Make sure to copy it somewhere safe.
        </p>
      </div>
    </div>
  );
}
