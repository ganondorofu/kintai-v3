'use client';

import { useState, useMemo, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Edit, ArrowUpDown, Search, RefreshCw } from "lucide-react"
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { updateUser, forceToggleAttendance, updateAllUserDisplayNames } from '@/app/actions';
import { Tables } from '@/lib/types';
import { User } from '@supabase/supabase-js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { convertGenerationToGrade } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type UserWithDetails = {
    id: string;
    display_name: string;
    card_id: string | null;
    team_name: string | null;
    team_id: number | null;
    generation: number;
    is_admin: boolean;
    latest_attendance_type: string | null;
    latest_timestamp: string | null;
    deleted_at: string | null;
    student_number: string | null;
    status: number;
};


type SortKey = keyof UserWithDetails;
type SortDirection = 'asc' | 'desc';

interface UsersTabProps {
    users: UserWithDetails[];
    teams: Tables<'member', 'teams'>[];
    currentUser: User;
}

const SortableHeader = ({
  children,
  sortKey,
  currentSort,
  onSort,
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  currentSort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
}) => {
  const isSorted = currentSort.key === sortKey;
  return (
    <TableHead onClick={() => onSort(sortKey)} className="cursor-pointer hover:bg-muted/50">
      <div className="flex items-center gap-2">
        {children}
        {isSorted && (
          <ArrowUpDown
            className={`h-4 w-4 transition-transform ${
              currentSort.direction === 'desc' ? 'rotate-180' : ''
            }`}
          />
        )}
        {!isSorted && <ArrowUpDown className="h-4 w-4 text-muted-foreground/50" />}
      </div>
    </TableHead>
  );
};


export default function UsersTab({ users: initialUsers, teams, currentUser }: UsersTabProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserWithDetails | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'display_name', direction: 'asc' });
    const [isToggling, startToggleTransition] = useTransition();
    const [isUpdatingNames, startUpdatingNamesTransition] = useTransition();


    const handleEdit = (user: UserWithDetails) => {
        setEditingUser(user);
        setDialogOpen(true);
    }
    
    const handleForceToggle = (userId: string) => {
        startToggleTransition(async () => {
            const result = await forceToggleAttendance(userId);
            if (result.success) {
                toast({ title: "成功", description: result.message });
                // We re-fetch data on success, so no need to update state manually
            } else {
                toast({ variant: "destructive", title: "エラー", description: result.message });
            }
        });
    }

    const handleUpdateAllNames = () => {
        startUpdatingNamesTransition(async () => {
            const result = await updateAllUserDisplayNames();
            toast({
                title: result.success ? "成功" : "エラー",
                description: result.message,
                variant: result.success ? "default" : "destructive",
            });
        });
    };

    const handleSort = (key: SortKey) => {
        setSort(prevSort => ({
            key,
            direction: prevSort.key === key && prevSort.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const sortedAndFilteredUsers = useMemo(() => {
        let filtered = initialUsers.filter(user =>
            user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.card_id && user.card_id.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        filtered.sort((a, b) => {
            const key = sort.key;
            let valA: any = a[key as keyof UserWithDetails];
            let valB: any = b[key as keyof UserWithDetails];
            
            if (typeof valA === 'string' && typeof valB === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        return filtered;
    }, [initialUsers, searchTerm, sort]);


    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingUser) return;
        
        setIsSubmitting(true);
        const formData = new FormData(event.currentTarget);
        
        const updatedData = {
            display_name: formData.get('display_name') as string,
            generation: Number(formData.get('generation')),
            team_id: Number(formData.get('team_id')),
            is_admin: formData.get('is_admin') === 'true',
            deleted_at: formData.get('is_active') === 'on' ? null : new Date().toISOString(),
            card_id: formData.get('card_id') as string,
            status: Number(formData.get('status')),
            student_number: formData.get('student_number') as string,
        };

        const result = await updateUser(editingUser.id, updatedData);

        if (result.success) {
            toast({ title: "成功", description: result.message });
            setDialogOpen(false);
        } else {
            toast({ variant: "destructive", title: "エラー", description: result.message });
        }
        setIsSubmitting(false);
    }

  return (
     <Card>
            <CardHeader>
                <CardTitle>ユーザー管理</CardTitle>
                <CardDescription>
                    ユーザー情報の表示と編集、および手動での出退勤操作を行います。
                </CardDescription>
            </CardHeader>
            <CardContent>
            <div className="mb-4 flex items-center gap-4">
                 <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="表示名またはカードIDで検索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline">
                            <RefreshCw className={`mr-2 h-4 w-4 ${isUpdatingNames ? 'animate-spin' : ''}`} />
                            表示名を更新
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>全ユーザーの表示名を更新しますか？</AlertDialogTitle>
                        <AlertDialogDescription>
                            Discordサーバーのニックネーム（本名）をAPI経由で取得し、このシステムの全ユーザーの表示名を上書きします。この操作は時間がかかる場合があります。
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel>キャンセル</AlertDialogCancel>
                        <AlertDialogAction onClick={handleUpdateAllNames} disabled={isUpdatingNames}>
                            {isUpdatingNames ? '更新中...' : '実行する'}
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <SortableHeader sortKey="display_name" currentSort={sort} onSort={handleSort}>表示名</SortableHeader>
                        <SortableHeader sortKey="team_name" currentSort={sort} onSort={handleSort}>班</SortableHeader>
                        <SortableHeader sortKey="generation" currentSort={sort} onSort={handleSort}>学年/期生</SortableHeader>
                        <SortableHeader sortKey="is_admin" currentSort={sort} onSort={handleSort}>役割</SortableHeader>
                        <SortableHeader sortKey="latest_attendance_type" currentSort={sort} onSort={handleSort}>現在の状態</SortableHeader>
                        <SortableHeader sortKey="card_id" currentSort={sort} onSort={handleSort}>カードID</SortableHeader>
                        <SortableHeader sortKey="deleted_at" currentSort={sort} onSort={handleSort}>アカウント</SortableHeader>
                        <TableHead>アクション</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedAndFilteredUsers?.map(user => (
                        <TableRow key={user.id} data-state={user.deleted_at ? "disabled" : ""} className={isToggling ? 'opacity-50' : ''}>
                            <TableCell className="font-medium">{user.display_name}</TableCell>
                            <TableCell>{user.team_name || '未所属'}</TableCell>
                            <TableCell>{convertGenerationToGrade(user.generation)}</TableCell>
                            <TableCell>
                                <Badge variant={user.is_admin ? "destructive" : "outline"}>{user.is_admin ? '管理者' : '部員'}</Badge>
                            </TableCell>
                             <TableCell>
                                <Badge variant={user.latest_attendance_type === 'in' ? 'default' : 'secondary'}>{user.latest_attendance_type === 'in' ? '出勤中' : '退勤'}</Badge>
                            </TableCell>
                            <TableCell className="font-mono">{user.card_id}</TableCell>
                             <TableCell>
                                <Badge variant={!user.deleted_at ? "default" : "secondary"}>{!user.deleted_at ? '有効' : '無効'}</Badge>
                            </TableCell>
                            <TableCell className="space-x-2 flex items-center">
                                <Button size="sm" variant="outline" onClick={() => handleForceToggle(user.id)} disabled={isToggling}>
                                    {user.latest_attendance_type === 'in' ? '強制退勤させる' : '強制出勤させる'}
                                </Button>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button size="icon" variant="ghost" onClick={() => handleEdit(user)}>
                                                <Edit className="h-4 w-4" />
                                                <span className="sr-only">Edit user</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>ユーザー情報を編集</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            </CardContent>
             <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>ユーザー情報の編集</DialogTitle>
                            <DialogDescription>
                                {editingUser?.display_name} の情報を編集します。
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div>
                                <Label htmlFor="display_name">表示名</Label>
                                <Input id="display_name" name="display_name" defaultValue={editingUser?.display_name} required />
                            </div>
                             <div>
                                <Label htmlFor="student_number">学籍番号</Label>
                                <Input id="student_number" name="student_number" defaultValue={editingUser?.student_number || ''} />
                            </div>
                            <div>
                                <Label htmlFor="generation">期生</Label>
                                <Input id="generation" name="generation" type="number" defaultValue={editingUser?.generation} required />
                            </div>
                             <div>
                                <Label htmlFor="status">身分</Label>
                                <Select name="status" defaultValue={String(editingUser?.status)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="身分を選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">中学生</SelectItem>
                                        <SelectItem value="1">高校生</SelectItem>
                                        <SelectItem value="2">OB/OG</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="team_id">班</Label>
                                <Select name="team_id" defaultValue={String(editingUser?.team_id)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="班を選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {teams.map(team => (
                                            <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div>
                                <Label htmlFor="is_admin">役割</Label>
                                <Select name="is_admin" defaultValue={String(editingUser?.is_admin)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="役割を選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="false">部員</SelectItem>
                                        <SelectItem value="true">管理者</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                             <div>
                                <Label htmlFor="card_id">カードID</Label>
                                <Input id="card_id" name="card_id" defaultValue={editingUser?.card_id || ''} required />
                            </div>
                             <div className="flex items-center space-x-2">
                                <Switch id="is_active" name="is_active" defaultChecked={!editingUser?.deleted_at} />
                                <Label htmlFor="is_active">アカウントを有効にする</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline" type="button">キャンセル</Button>
                            </DialogClose>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "保存中..." : "保存"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
             </Dialog>
        </Card>
  )
}
