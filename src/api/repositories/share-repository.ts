import { apiFetch, ApiError } from '../client';
import type { DerivedCurve, PublicRun, PublicVehicle } from '@/shared/types';

export interface PublicShareData {
  run: PublicRun;
  vehicle: PublicVehicle;
  curve: DerivedCurve;
}

export interface ShareTokenResponse {
  token: string;
  url: string;
}

export interface IShareRepository {
  getPublic(token: string): Promise<PublicShareData | null>;
  createToken(runId: string): Promise<ShareTokenResponse>;
  revokeToken(runId: string): Promise<void>;
}

export const shareRepository: IShareRepository = {
  getPublic: async (token) => {
    try {
      return await apiFetch<PublicShareData>(`/api/share/${token}`, {
        publicEndpoint: true,
      });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
        return null;
      }
      throw err;
    }
  },

  createToken: (runId) =>
    apiFetch<ShareTokenResponse>(`/api/runs/${runId}/share-token`, {
      method: 'POST',
    }),

  revokeToken: (runId) =>
    apiFetch<void>(`/api/runs/${runId}/share-token`, {
      method: 'DELETE',
    }),
};
