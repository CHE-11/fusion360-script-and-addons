export type ProParam = {
  name: string;
  value: string;
  unit?: string;
  comment?: string;
};

export type ProProject = {
  name: string;
  params: ProParam[];
};


