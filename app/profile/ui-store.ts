"use client";

import create from "zustand";
import type { SpaceMember } from "./types";

type ProfileUiState = {
  pendingCode: string;
  spaceNameInput: string;
  renameDialogOpen: boolean;
  pendingRename: string;
  renameSubmitting: boolean;
  removeDialogOpen: boolean;
  memberToRemove: SpaceMember | null;
  isRemovingMember: boolean;
  leaveDialogOpen: boolean;
  isLeavingSpace: boolean;
  transferOwnerId: string;
  copySuccess: boolean;
  regenerateSuccess: boolean;
  isRegenerating: boolean;
  joinError: string;
  setPendingCode: (value: string) => void;
  setSpaceNameInput: (value: string) => void;
  setRenameDialogOpen: (open: boolean) => void;
  setPendingRename: (value: string) => void;
  setRenameSubmitting: (value: boolean) => void;
  setRemoveDialogOpen: (open: boolean) => void;
  setMemberToRemove: (member: SpaceMember | null) => void;
  setIsRemovingMember: (value: boolean) => void;
  setLeaveDialogOpen: (open: boolean) => void;
  setIsLeavingSpace: (value: boolean) => void;
  setTransferOwnerId: (value: string) => void;
  setCopySuccess: (value: boolean) => void;
  setRegenerateSuccess: (value: boolean) => void;
  setIsRegenerating: (value: boolean) => void;
  setJoinError: (value: string) => void;
  resetUi: () => void;
};

const initialState = {
  pendingCode: "",
  spaceNameInput: "",
  renameDialogOpen: false,
  pendingRename: "",
  renameSubmitting: false,
  removeDialogOpen: false,
  memberToRemove: null,
  isRemovingMember: false,
  leaveDialogOpen: false,
  isLeavingSpace: false,
  transferOwnerId: "",
  copySuccess: false,
  regenerateSuccess: false,
  isRegenerating: false,
  joinError: "",
};

export const useProfileUiStore = create<ProfileUiState>((set) => ({
  ...initialState,
  setPendingCode: (pendingCode) => set({ pendingCode }),
  setSpaceNameInput: (spaceNameInput) => set({ spaceNameInput }),
  setRenameDialogOpen: (renameDialogOpen) => set({ renameDialogOpen }),
  setPendingRename: (pendingRename) => set({ pendingRename }),
  setRenameSubmitting: (renameSubmitting) => set({ renameSubmitting }),
  setRemoveDialogOpen: (removeDialogOpen) => set({ removeDialogOpen }),
  setMemberToRemove: (memberToRemove) => set({ memberToRemove }),
  setIsRemovingMember: (isRemovingMember) => set({ isRemovingMember }),
  setLeaveDialogOpen: (leaveDialogOpen) => set({ leaveDialogOpen }),
  setIsLeavingSpace: (isLeavingSpace) => set({ isLeavingSpace }),
  setTransferOwnerId: (transferOwnerId) => set({ transferOwnerId }),
  setCopySuccess: (copySuccess) => set({ copySuccess }),
  setRegenerateSuccess: (regenerateSuccess) => set({ regenerateSuccess }),
  setIsRegenerating: (isRegenerating) => set({ isRegenerating }),
  setJoinError: (joinError) => set({ joinError }),
  resetUi: () => set({ ...initialState }),
}));
