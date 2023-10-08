export interface Node {
    type: number
    data: DataView
    start: number
    nCells: number
    cellStart: number
    right: number
}
export type Schema = {
    page: number
    columns: string[]
    pks: string[]
    idcol?: string
    rowid: boolean
    indexes: Index[]
}
export type Index = {
    name: string
    type: 'rowid' | 'index'
    page: number
    columns: string[]
    ixcols: number
}
export type Lit
    = ['NUM', number]
    | ['STR', string]

export type QName = ['QN', O<string>, string]
export type Infix = ['IFX', string, Expr, Expr]
export type Expr
    = ['QN', O<string>, string]
    | ['LIT', Lit]
    | ['IFX', string, Expr, Expr]
    | ['PFX', string, Expr]
    | ['IN', Expr, Lit[] ]

export type Select = {
    select: Expr[] // these are actually expressions.. 
    from: TableSpec[]
    where?: Expr
}
export type O<A> = A|undefined

export type TableSpec = {
    name: string
    left: boolean
    on?: Expr
    as: string
}

export type Cell = {
    // left: number
    rowid?: number
    tuple: Tuple
}

export type Row = Record<string,Value>
export type Value = string | number | null | DataView
export type Tuple = Value[]