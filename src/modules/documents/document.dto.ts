import { Transform, type TransformFnParams } from 'class-transformer';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class SignDocumentDto {
  @Transform(decimal)
  @IsInt()
  @Min(1)
  @Max(1000)
  page!: number;

  @Transform(decimal)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  x!: number;

  @Transform(decimal)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  y!: number;
}

/** Converte campos multipart decimais sem tratar campos vazios como zero. */
function decimal({ value }: TransformFnParams): unknown {
  return typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
}
