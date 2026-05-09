'use client';

import { pauseApiKey, resumeApiKey, revokeApiKey } from '@/lib/actions/api-keys';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  maskedKey: string;
  environment: 'test' | 'live';
  status: 'active' | 'paused' | 'revoked';
  scopes: string[];
  allowedModels: string[];
  rpmLimit: number | null;
  dailyRequestLimit: number | null;
  monthlyBudgetCents: number | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export function ApiKeyTable({ keys }: { keys: ApiKey[] }) {
  if (keys.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center">
        No API keys yet. Create your first key to get started.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Key</TableHead>
          <TableHead>Environment</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Rate Limit</TableHead>
          <TableHead>Last Used</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id}>
            <TableCell className="font-medium">{key.name}</TableCell>
            <TableCell className="font-mono text-sm">
              {key.maskedKey}
            </TableCell>
            <TableCell>
              <Badge variant={key.environment === 'live' ? 'default' : 'secondary'}>
                {key.environment}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  key.status === 'active' ? 'default' :
                  key.status === 'paused' ? 'secondary' : 'destructive'
                }
              >
                {key.status}
              </Badge>
            </TableCell>
            <TableCell>{key.rpmLimit} RPM</TableCell>
            <TableCell>
              {key.lastUsedAt
                ? new Date(key.lastUsedAt).toLocaleDateString()
                : 'Never'}
            </TableCell>
            <TableCell>
              <div className="flex gap-2">
                {key.status === 'active' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pauseApiKey(key.id)}
                  >
                    Pause
                  </Button>
                ) : key.status === 'paused' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resumeApiKey(key.id)}
                  >
                    Resume
                  </Button>
                ) : null}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => revokeApiKey(key.id)}
                >
                  Revoke
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
