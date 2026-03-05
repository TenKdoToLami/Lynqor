export type Folder = {
    id: string;
    parentId: string | null;
    name: string;
    isLocked: boolean;
    createdAt: string;
};

export type ItemType = 'NOTE';

export type Item = {
    id: string;
    folderId: string | null;
    itemType: string;
    title: string;
    content: string;
    imageUrl?: string;
    createdAt: string;
};
