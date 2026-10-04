import { IsBoolean, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
export class LocationDto {
  @IsUUID('4') tripId!: string;
  @IsUUID('4') clientPointId!: string;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-90) @Max(90) latitude!: number;
  @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-180) @Max(180) longitude!: number;
  // GPS reports -1 when speed or bearing is unavailable; the client sends null.
  @IsOptional() @IsNumber() @Min(0) @Max(359.999999999) heading!: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) speed!: number | null;
  @IsInt() @Min(0) @Max(8640000000000000) timestamp!: number;
  @IsBoolean() isOfflineCache!: boolean;
}
