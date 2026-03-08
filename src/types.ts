export type Folder = {
    id: string;
    parentId: string | null;
    name: string;
    description?: string;
    imageUrl?: string;
    isLocked: boolean;
    orderIndex: number;
    createdAt: string;
    updatedAt: string;
};

export type ItemType = 'NOTE';

export type Item = {
    id: string;
    folderId: string | null;
    itemType: string;
    title: string;
    content: string;
    imageUrl?: string;
    orderIndex: number;
    createdAt: string;
    updatedAt: string;
};
